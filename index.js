'use strict';

var debug = require('debug')('proxy-orchestrator'),
	querystring = require('querystring'),
	http = require('http'),
	https = require('https');

function proxy(opts, req, res) {

	return /** @lends proxy.prototype */ {
		res: res,
		req: req,
		headers: (req && (req.headers || req._headers)) || {
			'Accept-Encoding': 'gzip, deflate',
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/json;charset=UTF-8'
		},
		timeout: opts.timeout !== undefined ? opts.timeout : process.env.TIMEOUT || 20000, //default timwe out 20 seconds, zero - no timeout

		request: function(callback, method, path, data, query) {

			if (query && Object.keys(query).length) {
				path += (path.indexOf('?') === -1 ? '?' : '&') + querystring.stringify(query);
			}

			if (method === 'GET' && data && Object.keys(data).length) {
				path += (path.indexOf('?') === -1 ? '?' : '&') + querystring.stringify(data);
			}

			delete this.headers.host;

			var server, content, req,
				isMuiltipart = false,
				self = this,
				options = {
					host: opts.host,
					port: opts.port,
					headers: this.headers,
					method: method,
					path: path
				};

			if (opts.secure !== undefined) {
				server = opts.secure ? https : http;
			} else {
				server = options.port !== 80 ? https : http;
			}

			if (method !== 'GET') {
				content = typeof(data) === 'string' ? data : JSON.stringify(data) || '';
			}

			if ((options.headers['content-type'] || '').indexOf('multipart/form-data') !== -1) {
				isMuiltipart = true;
			} else if (content) {
				options.headers['content-length'] = Buffer.byteLength(content);
			} else {
				delete options.headers['content-length'];
			}

			options.scheme = (server === https  ? 'HTTPS' : 'HTTP');

			debug('isMuiltipart -> %s', isMuiltipart);	
			debug('options -> %s', JSON.stringify(options, null, 2));

			req = server.request(options, function(res) {
				var data, responseString = '',
					isPipe = self.res && self.res._headerSent === false;

				if (isPipe) {
					self.res.writeHead(res.statusCode, res.headers);
				}

				res.on('data', function(chunk) {
					if (isPipe) {
						self.res.write(chunk);
					}
					responseString += chunk;
				});

				res.on('end', function() {
					delete res.headers['date'];
					delete res.headers['connection'];
					delete res.headers['x-powered-by'];

					if (isPipe) {
						callback(null, responseString, req, res, isPipe);
					} else {
						try {
							data = JSON.parse(responseString);
							res.setEncoding('utf-8');
						} catch (e) {
							data = responseString;
						}

						if (res.statusCode >= 200 && res.statusCode <= 226) {
							callback(null, data, req, res);
						} else {
							callback(data, null, req, res);
						}
					}
				});
			});

			req.on('error', function(error) {
				callback(error, null, req, {statusCode: 500, message: 'Internal Server Error', error: error});
			});

			if (self.timeout) {
				req.on('socket', function (socket) {
					socket.setTimeout(self.timeout);  
					socket.on('timeout', function() {
						debug('TIMEOUT');
						req.abort();
					});
				});
			}

			if (isMuiltipart) { //Upload file
				this.req.pipe(req);
			} else {
				req.end(content);
			}

			return req;
		}
	};
}

/**
 * @module proxy
 * @see {@link proxy}
 */
module.exports = proxy;