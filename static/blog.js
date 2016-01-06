$(function() {
	var url = window.location.toString();

	if (url.lastIndexOf("?") > -1) {

		url_source = url.substring(url.lastIndexOf("?") + 1);
		source = url_source.replace(/[-^a-z0-9]/gi, '').toLowerCase();

		/* All pages should be lowercase */
		if (source !== url_source) {
			window.location = url.substring(0, url.lastIndexOf("?") + 1) + source;
		}

	} else {
		source = "index";
	}

	source = source + ".md";

	$.ajax({
		url: "data/" + source
	}).done(function(data) {

		marked.setOptions({
			highlight: function (code) {
				return hljs.highlightAuto(code).value;
			},

			/*  I'm setting this to false because blog articles are assumed to be
				trusted. We can use this to create special styling in certain articles
				without having to redo the entire system
			*/
			sanitize: false,

			smartypants: true
		});

        $("#text-data").html(marked(data));

	}).fail(function() {
		window.location = url.substring(0, url.lastIndexOf("?") + 1) + "404";
	});
});
