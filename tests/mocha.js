'use strict';

var http = require('http'),
	https = require('https'),
	fs = require('fs'),
	assert = require('assert'),
	proxy = require('../index'),
	formData = require('form-data');

var portHttp = 1234,
	portHttps = 4321,
	httpServer,
	httpsServer;

describe('Testing Proxy', function () {

	process.env.NODE_TLS_REJECT_UNAUTHORIZED = 0;

	before(function (done) {
		httpServer = http.createServer(routeHanlder());
		httpsServer = https.createServer({
			key: fs.readFileSync('./tests/key.pem'),
			cert: fs.readFileSync('./tests/key-cert.pem')
		}, routeHanlder());

		httpServer.listen(portHttp, function() {
			console.log("HTTP Server listening on: http://localhost:%s", portHttp);
			httpsServer.listen(portHttps, function() {
				console.log("HTTPS Server listening on: http://localhost:%s", portHttps);
				done();
			});
		});
	});

	after(function(done) {
		httpServer.close();
		httpsServer.close();
		done();
	});

	it('Should update header by responseIntercept', function(done) {
		var newContentType =  'application/xml';
		proxy({
			host: 'localhost',
			port: portHttp,
			secure: false
		}, null, null, function(req, res) {
			assert.equal(res.headers['content-type'], 'application/json');
			res.headers['content-type'] = newContentType;
		}).request(function(err, result, req, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 200);
			assert.equal(res.headers['content-type'], newContentType);
			done();
		}, 'GET', '/test', null, {format: 'json'});
	});

	it('Should test JSON response by query param (HTTP)', function(done) {
		proxy({
			host: 'localhost',
			port: portHttp,
			secure: false
		}).request(function(err, result, req, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 200);
			assert.equal(result.status, 'OK');
			done();
		}, 'GET', '/test', null, {format: 'json'});
	});

	it('Should test JSON response by query param in URL (HTTPS)', function(done) {
		proxy({
			host: 'localhost',
			port: portHttps,
			secure: true
		}).request(function(err, result, req, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 200);
			assert.equal(result.status, 'OK');
			done();
		}, 'GET', '/test?format=json');
	});

	it('Should test JSON error response using custom header and data params (HTTPS)', function(done) {
		var rest = proxy({
			host: 'localhost',
			port: portHttps
		});

		rest.request(function(err, result, req, res) {
			assert.ok(err !== null);
			assert.equal(res.statusCode, 400);
			assert.equal(err.status, 'Error');
			done();
		}, 'GET', '/test', {error: true, format: 'json'});
	});

	it('Should test XML error response as query in URL and data param (HTTPS)', function(done) {
		proxy({
			host: 'localhost',
			port: portHttps
		}).request(function(err, result, req, res) {
			assert.ok(err !== null);
			assert.equal(res.statusCode, 400);
			assert.equal(err, '<status>Error</status>');
			done();
		}, 'GET', '/test?format=xml', {error: true});
	});

	it('Should test POST -> JSON response (HTTPS)', function(done) {
		proxy({
			host: 'localhost',
			port: portHttps
		}).request(function(err, result, req, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 200);
			assert.equal(result.hello, 'world');
			done();
		}, 'POST', '/test', {hello: 'world'}, {format: 'json'});
	});

	it('Should test POST -> XML response (HTTPS)', function(done) {
		proxy({
			host: 'localhost',
			port: portHttps
		}).request(function(err, result, req, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 200);
			assert.equal(result, '<hello>world</hello>');
			done();
		}, 'POST', '/test?error=false', '<hello>world</hello>', {format: 'xml'});
	});

	it('Should test by pass the header of the parent request', function(done) {
		proxy({
			host: 'api.linkedin.com',
			port: 80,
			timeout: 0
		}).request(function(err, result, req1) {
			proxy({
				host: 'localhost',
				port: portHttps
			}, req1).request(function(err, result, req2, res2) {
				assert.ok(err === null);
				for (var name in req1._headers) {
					assert.equal(req1._headers[name], res2.headers[name], name);
				}
				done();
			}, 'POST', '/test?format=json');
		}, 'GET', '/v1?format=json');
	});

	it('Should test multipart/form-data content type)', function(done) {
		var form = new formData();
		form.append('upload', fs.createReadStream(__dirname + '/key.pem'));
		form.submit({
			host: 'localhost',
			port: portHttp,
			path: '/proxy'
		}, function (err, res) {
			assert.ok(err === null);
			assert.equal(res.statusCode, 201); //Uploaded
			done();
		});
	});

	it('Should test request ECONNRESET error (timeout)', function(done) {
		proxy({
			host: 'localhost',
			port: 12345,
			timeout: 5
		}).request(function(err) {
			assert.ok(err !== null);
			assert.ok(err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED');
			done();
		}, 'POST', '/test');
	});
});

function routeHanlder() {
	return function(req, res) {

		var array = unescape(req.url).split('?'),
			path = array[0],
			query = array.length === 2 ? array[1] : '';

		if (path === '/test') {
			if (req.method === 'POST') {
				var body = '';
				req.on('data', function (data) {
					body += data;
				});
				req.on('end', function () {
					var headers = req.headers;
					if (query.indexOf('format=json') !== -1) {
						headers['Content-Type'] = 'application/json';
					} else {
						headers['Content-Type'] = 'application/xml';
					}
					res.writeHead(200, headers);
					res.write(body);
					res.end();
				});
				return;
			} else if (query.indexOf('redirect=true') !== -1) {
				res.writeHead(302, { 'Location': 'http://www.google.com'});
			} else if (query.indexOf('error=true') !== -1) {
				if (query.indexOf('format=json') !== -1) {
					res.writeHead(400, {'Content-Type': 'application/json'});
					res.write(JSON.stringify({ status: 'Error' }));
				} else {
					res.writeHead(400, {'Content-Type': 'application/xml'});
					res.write('<status>Error</status>');
				}
			} else {
				if (query.indexOf('format=json') !== -1) {
					res.writeHead(200, {'Content-Type': 'application/json'});
					res.write(JSON.stringify({ status: 'OK' }));
				} else {
					res.writeHead(200, {'Content-Type': 'application/xml'});
					res.write('<status>OK</status>');
				}	
			}
			res.end();
		} else if (path === '/proxy') {
			proxy({
				host: 'localhost',
				port: portHttps
			}, req, res).request(function(err, result, proxy_req, proxy_res, isPipe) {
				assert.ok(err === null);
				assert.equal(proxy_res.statusCode, 201);
				assert.equal(isPipe, true);
				assert.equal(result, 'UPLOADED');
				res.end();
			}, 'POST', '/upload');
		} else if (path === '/upload') {
			res.writeHead(201, {'Content-Type': 'application/text'});  //Uploaded
			res.end('UPLOADED');
		}
	};
}