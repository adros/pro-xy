## url-replace

Simple http proxy for redirecting requests to alternative URL.

It can be used during development to redirect selected URLs (e.g. XHR requests) to another server (e.g. test/production server)
without making cross-origin calls.

It also allows to define plugins, that can change request or response in any other way.

## Usage

1. Install
		npm install -g url-replace

2. Create config file. Config file is single JSON file named .proxyrc.json. It can be placed in your home folder or in current folder. See below for config format.

3. Run.
		url-replace

Alternatively url-replace can also be required from another module and launched be calling *startProxy* method.

## Config file

Sample:

	{
		"port" : 8000,
		"replaces" : [
			{
				"name" : "test9090",
				"pattern" : "//localhost:8080/svc/",
				"replacement" : "//testserver.company.com:9090/svc/",
				"disabled" : false
			}
		],
		"plugins" : [
			"cookie-replacer",
			"auto-responder"
		],
		"cookie-replacer" : [
			{
				"urlPattern" : ".*",
				"pattern" : "test",
				"replacement" : "_test"
			}
		],
		"auto-responder" : [
			{
				"test" : "/svc/users",
				"target" : "users.json"
			}
		]
	}

This sample file defines single replace, that will cause that all requests to "//localhost:8080/svc/*" will not go to the localhost. Instead they will be redirected to "//testserver.company.com:9090/svc/*". The rest of URL is left unchanged.

It also defines 2 plugins and their configs. See their docs for details.

* **port** - port for proxy
* **replace** - array of replaces to apply
	* **name** - any string to identify replace, e.g. name of target environment
	* **pattern** - RegExp to match in request URLs
	* **replacement** - string to replace matched part of request URL
	* **disabled** - boolean used to temporarily disable replace, so that you can keep multiple replaces in a single config file and easily switch between them
* **plugins** - list of plugins to use. Plugins are represented by name of their npm package and must be installed alongside url-replace to be used.

## Plugins

Plugins are npm packages with single function which receives config, request and response. If plugin returns truthy value, it means it has processed request completely and no following plugins and replaces will be applied.

	function(config, req, res) {
		//do something
		return false;
	}
