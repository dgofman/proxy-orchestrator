'use strict';

var debug = require('debug')('proxy-orchestrator'),
	querystring = require('querystring'),
	http = require('http'),
	https = require('https');

function proxy(opts, req, res) {

	return /** @lends proxy.prototype */ {
		res: res,
		req: req,
		headers: {
			'Accept-Encoding': 'gzip, deflate',
			'Cache-Control': 'no-cache',
			'Content-Type': 'application/json;charset=UTF-8'
		},

		request: function(callback, method, path, data, query) {

			if (query && Object.keys(query).length) {
				path += (path.indexOf('?') === -1 ? '?' : '&') + querystring.stringify(query);
			}

			if (method === 'GET' && data && Object.keys(data).length) {
				path += (path.indexOf('?') === -1 ? '?' : '&') + querystring.stringify(data);
			}

			var server, content, req,
				isMuiltipart = false,
				self = this,
				options = {
					host: opts.host,
					port: opts.port,
					headers: (this.req && (this.req.headers || this.req._headers)) || this.headers,
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
				if ((options.headers['content-type'] || '').indexOf('multipart/form-data') !== -1) {
					isMuiltipart = true;
				} else {
					options.headers['content-length'] = content.length;
				}
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
				callback(error, null, req);
			});

			if (isMuiltipart) { //Upload file
				this.req.pipe(req);
			} else {
				req.end(content);
			}
		}
	};
}

/**
 * @module proxy
 * @see {@link proxy}
 */
module.exports = proxy;