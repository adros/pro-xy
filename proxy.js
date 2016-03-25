var httpProxy = require("http-proxy");
var http = require("http");
var fs = require("fs");
var url = require("url");

var configLocations = [
	"./.proxyrc.json",
	"~/.proxyrc.json"
];

function startProxy() {

	var config = loadConfig();
	if (!config) {
		console.error("Config not found");
		process.exit(1);
	}
	var proxy = httpProxy.createProxyServer({});
	var server = http.createServer(function(req, res) {
		config.replaces.forEach(function(replace) {
			if (!replace.disabled) {
				req.url = req.url.replace(replace.pattern, replace.replacement);
			}
		});
		console.log(req.url);
		console.log(getHost(req.url));
		proxy.web(req, res, {
			target: getHost(req.url)
		});
	});
	server.listen(config.part);
}

function loadConfig() {
	var config;
	configLocations.some(function(location) {
		if (fs.existsSync(location)) {
			config = JSON.parse(fs.readFileSync(location, "utf-8"));
			return true;
		}
	});
	return config;
}

function getHost(targetUrl) {
	var parsedUrl = url.parse(targetUrl);
	return parsedUrl.protocol + "//" + parsedUrl.host;
}

if (require.main == module) {
	//launched from command line, start proxy now
	startProxy();
} else {
	//required from another module, just export function
	exports.startProxy = startProxy;
}
