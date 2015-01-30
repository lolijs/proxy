/*	devProxy.js 0.1
 *	通过将数据请求转发到远程服务器, 来在本地开发环境中模拟服务器环境, 以实现完整的网站功能
 *	脚本执行时会从当前目录载入proxyConfig.js
 *	proxyConfig.js模版参见:
 *
 *	'use strict';
 *	module.exports={
 *
 *		// 所有POST请求和匹配这个表达式的URL将被转发到远程代理, 否则将使用本地服务器或文件
 *		rule:/?/,
 *
 *		// 远程服务器地址
 *		remote:'https://www.yiqihao.com/prefix',
 *
 *		// 以下配置为本地静态文件模式
 *		// 若配置为静态文件模式, 本地找不到对应文件时仍会将请求转发至远程服务器
 *		// prefix: root对应的url前缀, 如果请求中不包含此前缀则会被转发至远程服务器(根路径除外)
 *		//         利用这个配置可以实现将 http://www.yiqihao.com/mweb 映射到 root 中指定的 ./
 *		local:{
 *			prefix:'/mweb',
 *			root:'./',
 *			index:'/index.html'
 *		},
 *
 *		// local也可以配置为代理模式, 以便于启用php模版或其他功能
 *		//local:'http://somelocalhost:8080/prefix',
 *
 *		// 本地监听端口
 *		port:1990
 *	};
 */

'use strict';
var http = require('http');
var https = require('https');
var util = require('util');
var path = require('path');
var fs = require('fs');
var dir = process.argv.length > 2 ? process.argv[2] : process.cwd();
var config = require(path.join(dir, 'proxyConfig.js'));

var mimes = {
	'': 'application/octet-stream',
	'html': 'text/html',
	'js': 'text/javascript',
	'css': 'text/css',
	'jpg': 'image/jpeg',
	'png': 'image/png',
	'gif': 'image/gif',
	'svg': 'image/svg+xml'
};

if (config instanceof Array) {
	for (var i = 0; i < config.length; i++) {
		run(config[i]);
	}
} else {
	run(config);
}

function run(config) {
	console.log(config);
	config.remote = parseServer(config.remote);

	if (typeof config.local === 'string') {
		config.local = parseServer(config.local);
	} else {
		if (!config.local.prefix) {
			config.local.prefix = '/';
		}
	}

	http.createServer(function(req, res) {
		if (req.method === 'POST' || (config.rule && req.url.match(config.rule)) || (config.local instanceof Object && config.local.prefix && req.url !== '/' && req.url.indexOf(config.local.prefix) !== 0)) {
			httpproxy(config.remote, req, res);
		} else {
			if (config.local instanceof Array) {
				httpproxy(config.local, req, res);
			} else {
				staticfile(config, req, res);
			}
		}
	}).listen(config.port, '0.0.0.0');
}

function staticfile(config, req, res) {
	var u = req.url.replace(/\?.*$/, '');
	if (u === '/') {
		u = config.local.prefix + config.local.index;
	}
	var p, v = u.indexOf(config.local.prefix);
	if (v < 0) {
		httpproxy(config.remote, req, res);
	} else {
		p = path.join(dir, config.local.root, u.substr(v + config.local.prefix.length));
		fs.stat(p, function(err, stat) {
			if (err) {
				httpproxy(config.remote, req, res);
			} else {
				if (stat.isDirectory()) {
					httpproxy(config.remote, req, res);
				} else {
					var m = mimes[path.extname(p).substr(1)];
					if (!m) {
						m = mimes[''];
					}
					var f = fs.createReadStream(p);
					res.writeHeader(200, 'OK', {
						'Content-Type': m,
						'Content-Length': stat.size,
						'Last-Modified': stat.mtime
					});
					f.pipe(res);
					console.log('static: ' + req.url);
				}
			}
		});
	}
}

function httpproxy(server, req, res) {
	var n;
	var info = {
		host: server[1],
		port: server[2],
		path: server[3] + req.url,
		method: req.method
	};
	var proxy = server[0].request(info, function(res2) {
		var cookie = res2.headers['set-cookie'];
		if (cookie instanceof Array) {
			for (var i = 0; i < cookie.length; i++) {
				cookie[i] = cookie[i].replace(/; domain=[^;]+/, '');
			}
		}
		delete res2.headers['access-control-allow-origin'];
		res.writeHeader(res2.statusCode, res2.headers);
		res2.pipe(res);
		console.log(buildServerStr(server) + req.url);
	});
	proxy.on('error', function(err) {
		console.log(err);
		res.end();
	});
	for (n in req.headers) {
		if (['host', 'origin', 'referer'].indexOf(n) < 0) {
			//console.log(n + ': ' + req.headers[n]);
			proxy.setHeader(n, req.headers[n]);
		}
		//console.log(n);
	}
	req.pipe(proxy);
}

function parseServer(str) {
	var r = str.match(/^http(s?):\/\/([^\/:]+)(?::(\d+))?(\/.+)?$/);
	if (r) {
		delete r.index;
		delete r.source;
		r.shift();
		r[2] = r[2] ? parseInt(r[2]) : r[0] ? 443 : 80;
		r[0] = r[0] ? https : http;
		!r[3] && (r[3] = '');
	}
	return r;
}

function buildServerStr(server) {
	var s = 'http';
	if (server[0] === https) {
		s += 's';
	}
	s += '://' + server[1];
	if ((server[0] === https && server[2] !== 443) || (server[0] === http && server[2] !== 80)) {
		s += ':' + server[2];
	}
	s += server[3];
	return s;
}