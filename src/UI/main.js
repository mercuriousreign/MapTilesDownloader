var mapView;

$(function() {

	var map = null; //Variable that contains the Mapbox view  for user to interact with

	var draw = null; // Contains information about user drawn reactangle such as the start position, used for pinpointing position of map download

	var geocoder = null; // Contain Mapbox geocode process for conversion of location to long and lattitude, etc.

	var bar = null;

	var cancellationToken = null; //Boolean to check if user has cancel the download process

	var requests = []; // array of all requests used in stopDownload function originally to abort tile download, now it is used to validateDownload and retry download (hopefully)

	var missedRequest = []; //Draft array to insert requests that were missed
	
	var missedTiles = []; //Draft array to insert tiles that were missed;

	var missedData = [];//

	//Contains all different sources to download map from, has variable that takes mapbox's information (quad,x,y,z).

	var sources = {

		"Bing Maps": "http://ecn.t0.tiles.virtualearth.net/tiles/r{quad}.jpeg?g=129&mkt=en&stl=H",
		"Bing Maps Satellite": "http://ecn.t0.tiles.virtualearth.net/tiles/a{quad}.jpeg?g=129&mkt=en&stl=H",
		"Bing Maps Hybrid": "http://ecn.t0.tiles.virtualearth.net/tiles/h{quad}.jpeg?g=129&mkt=en&stl=H",

		"div-1B": "",

		"Google Maps": "https://mt0.google.com/vt?lyrs=m&x={x}&s=&y={y}&z={z}",
		"Google Maps Satellite": "https://mt0.google.com/vt?lyrs=s&x={x}&s=&y={y}&z={z}",
		"Google Maps Hybrid": "https://mt0.google.com/vt?lyrs=h&x={x}&s=&y={y}&z={z}",
		"Google Maps Terrain": "https://mt0.google.com/vt?lyrs=p&x={x}&s=&y={y}&z={z}",

		"div-2": "",

		"Open Street Maps": "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
		"Open Cycle Maps": "http://a.tile.opencyclemap.org/cycle/{z}/{x}/{y}.png",
		"Open PT Transport": "http://openptmap.org/tiles/{z}/{x}/{y}.png",

		"div-3": "",

		"ESRI World Imagery": "http://services.arcgisonline.com/arcgis/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
		"Wikimedia Maps": "https://maps.wikimedia.org/osm-intl/{z}/{x}/{y}.png",
		"NASA GIBS": "https://map1.vis.earthdata.nasa.gov/wmts-webmerc/MODIS_Terra_CorrectedReflectance_TrueColor/default/GoogleMapsCompatible_Level9/{z}/{y}/{x}.jpg",

		"div-4": "",

		"Carto Light": "http://cartodb-basemaps-c.global.ssl.fastly.net/light_all/{z}/{x}/{y}.png",
		"Stamen Toner B&W": "http://a.tile.stamen.com/toner/{z}/{x}/{y}.png",

	};

	function initializeMap() {

		// new token here

		mapboxgl.accessToken = 'pk.eyJ1IjoibWVyY3VyeXJlaWduIiwiYSI6ImNsbnZ3YnF2MDAydHgybmp5MWRlZGJ6dGwifQ.cU-vFZvjlnWDngTGd7410w'

		map = new mapboxgl.Map({
			container: 'map-view',
			style: 'mapbox://styles/aliashraf/ck6lw9nr80lvo1ipj8zovttdx',
			center: [-73.983652, 40.755024], 
			zoom: 12
		});

		geocoder = new MapboxGeocoder({ accessToken: mapboxgl.accessToken });

		//Initial map is only a view, thus neeeds a seperate plugin to process information
		var control = map.addControl(geocoder);
	}

	//<-- Functions related to UI -->

	function initializeMaterialize() {
		$('select').formSelect();
		$('.dropdown-trigger').dropdown({
			constrainWidth: false,
		});
	}

	function initializeSources() {

		var dropdown = $("#sources");

		for(var key in sources) {
			var url = sources[key];

			if(url == "") {
				dropdown.append("<hr/>");
				continue;
			}

			var item = $("<li><a></a></li>");
			item.attr("data-url", url);
			item.find("a").text(key);

			item.click(function() {
				var url = $(this).attr("data-url");
				$("#source-box").val(url);
			})

			dropdown.append(item);
		}
	}

	function initializeSearch() {
		$("#search-form").submit(function(e) {
			var location = $("#location-box").val();
			geocoder.query(location);

			e.preventDefault();
		})
	}

	function initializeMoreOptions() {

		$("#more-options-toggle").click(function() {
			$("#more-options").toggle();
		})

		var outputFileBox = $("#output-file-box")
		$("#output-type").change(function() {
			var outputType = $("#output-type").val();
			if(outputType == "mbtiles") {
				outputFileBox.val("tiles.mbtiles")
			} else if(outputType == "repo") {
				outputFileBox.val("tiles.repo")
			} else if(outputType == "directory") {
				outputFileBox.val("{z}/{x}/{y}.png")
			}
		})

	}

	function initializeRectangleTool() {
		
		var modes = MapboxDraw.modes;
		modes.draw_rectangle = DrawRectangle.default;

		draw = new MapboxDraw({
			modes: modes
		});
		map.addControl(draw);

		map.on('draw.create', function (e) {
			M.Toast.dismissAll();
		});

		$("#rectangle-draw-button").click(function() {
			startDrawing();
		})

	}

	//<--- Functions related to Tile geocode --->

	//Gives message and sets draw mode for user to draw area to download tiles
	function startDrawing() {
		removeGrid();
		draw.deleteAll();
		draw.changeMode('draw_rectangle');

		M.Toast.dismissAll();
		
		M.toast({html: 'Click two points on the map to make a rectangle.', displayLength: 7000})
	}

	function initializeGridPreview() {
		$("#grid-preview-button").click(previewGrid);

		map.on('click', showTilePopup);
	}

	//Shows and extra rectangle based on initial draw that allows you to modify area to download tiles
	function showTilePopup(e) {

		if(!e.originalEvent.ctrlKey) {
			return;
		}

		var maxZoom = getMaxZoom();

		var x = lat2tile(e.lngLat.lat, maxZoom);
		var y = long2tile(e.lngLat.lng, maxZoom);

		var content = "X, Y, Z<br/><b>" + x + ", " + y + ", " + maxZoom + "</b><hr/>";
		content += "Lat, Lng<br/><b>" + e.lngLat.lat + ", " + e.lngLat.lng + "</b>";

        new mapboxgl.Popup()
            .setLngLat(e.lngLat)
            .setHTML(content)
            .addTo(map);

        console.log(e.lngLat)

	}

	//<-- Functions that calculates tiles dimension -->
	function long2tile(lon,zoom) {
		return (Math.floor((lon+180)/360*Math.pow(2,zoom)));
	}

	function lat2tile(lat,zoom)  {
		return (Math.floor((1-Math.log(Math.tan(lat*Math.PI/180) + 1/Math.cos(lat*Math.PI/180))/Math.PI)/2 *Math.pow(2,zoom)));
	}

	function tile2long(x,z) {
		return (x/Math.pow(2,z)*360-180);
	}

	function tile2lat(y,z) {
		var n=Math.PI-2*Math.PI*y/Math.pow(2,z);
		return (180/Math.PI*Math.atan(0.5*(Math.exp(n)-Math.exp(-n))));
	}


	//Is this the actual image?
	function getTileRect(x, y, zoom) {

		var c1 = new mapboxgl.LngLat(tile2long(x, zoom), tile2lat(y, zoom));
		var c2 = new mapboxgl.LngLat(tile2long(x + 1, zoom), tile2lat(y + 1, zoom));

		return new mapboxgl.LngLatBounds(c1, c2);
	}

	function getMinZoom() {
		return Math.min(parseInt($("#zoom-from-box").val()), parseInt($("#zoom-to-box").val()));
	}

	function getMaxZoom() {
		return Math.max(parseInt($("#zoom-from-box").val()), parseInt($("#zoom-to-box").val()));
	}

	function getArrayByBounds(bounds) {

		var tileArray = [
			[ bounds.getSouthWest().lng, bounds.getNorthEast().lat ],
			[ bounds.getNorthEast().lng, bounds.getNorthEast().lat ],
			[ bounds.getNorthEast().lng, bounds.getSouthWest().lat ],
			[ bounds.getSouthWest().lng, bounds.getSouthWest().lat ],
			[ bounds.getSouthWest().lng, bounds.getNorthEast().lat ],
		];

		return tileArray;
	}

	function getPolygonByBounds(bounds) {

		var tilePolygonData = getArrayByBounds(bounds);

		var polygon = turf.polygon([tilePolygonData]);

		return polygon;
	}

	function isTileInSelection(tileRect) {

		var polygon = getPolygonByBounds(tileRect);

		var areaPolygon = draw.getAll().features[0];

		if(turf.booleanDisjoint(polygon, areaPolygon) == false) {
			return true;
		}

		return false;
	}

	function getBounds() {

		var coordinates = draw.getAll().features[0].geometry.coordinates[0];

		var bounds = coordinates.reduce(function(bounds, coord) {
			return bounds.extend(coord);
		}, new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]));

		return bounds;
	}

	function getGrid(zoomLevel) {

		var bounds = getBounds();

		var rects = [];

		var outputScale = $("#output-scale").val();
		//var thisZoom = zoomLevel - (outputScale-1)
		var thisZoom = zoomLevel

		var TY    = lat2tile(bounds.getNorthEast().lat, thisZoom);
		var LX   = long2tile(bounds.getSouthWest().lng, thisZoom);
		var BY = lat2tile(bounds.getSouthWest().lat, thisZoom);
		var RX  = long2tile(bounds.getNorthEast().lng, thisZoom);

		for(var y = TY; y <= BY; y++) {
			for(var x = LX; x <= RX; x++) {

				var rect = getTileRect(x, y, thisZoom);

				if(isTileInSelection(rect)) {
					rects.push({
						x: x,
						y: y,
						z: thisZoom,
						rect: rect,
					});
				}

			}
		}

		return rects
	}

	function getAllGridTiles() {
		var allTiles = [];

		for(var z = getMinZoom(); z <= getMaxZoom(); z++) {
			var grid = getGrid(z);
			// TODO shuffle grid via a heuristic (hamlet curve? :/)
			allTiles = allTiles.concat(grid);
		}

		return allTiles;
	}

	function removeGrid() {
		removeLayer("grid-preview");
	}

	function previewGrid() {

		var maxZoom = getMaxZoom();
		var grid = getGrid(maxZoom);

		var pointsCollection = []

		for(var i in grid) {
			var feature = grid[i];
			var array = getArrayByBounds(feature.rect);
			pointsCollection.push(array);
		}

		removeGrid();

		map.addLayer({
			'id': "grid-preview",
			'type': 'line',
			'source': {
				'type': 'geojson',
				'data': turf.polygon(pointsCollection),
			},
			'layout': {},
			'paint': {
				"line-color": "#fa8231",
				"line-width": 3,
			}
		});

		var totalTiles = getAllGridTiles().length;
		M.toast({html: 'Total ' + totalTiles.toLocaleString() + ' tiles in the region.', displayLength: 5000})

	}

	//Adds a layer of grid preview to the mapbox
	function previewRect(rectInfo) {

		var array = getArrayByBounds(rectInfo.rect);

		var id = "temp-" + rectInfo.x + '-' + rectInfo.y + '-' + rectInfo.z;

		map.addLayer({
			'id': id,
			'type': 'line',
			'source': {
				'type': 'geojson',
				'data': turf.polygon([array]),
			},
			'layout': {},
			'paint': {
				"line-color": "#ff9f1a",
				"line-width": 3,
			}
		});

		return id;
	}

	//Removes the layer that exists on mapbox
	function removeLayer(id) {
		if(map.getSource(id) != null) {
			map.removeLayer(id);
			map.removeSource(id);
		}
	}


	function generateQuadKey(x, y, z) {
	    var quadKey = [];
	    for (var i = z; i > 0; i--) {
	        var digit = '0';
	        var mask = 1 << (i - 1);
	        if ((x & mask) != 0) {
	            digit++;
	        }
	        if ((y & mask) != 0) {
	            digit++;
	            digit++;
	        }
	        quadKey.push(digit);
	    }
	    return quadKey.join('');
	}

	//<-- Setups the UI page (Download)
	function initializeDownloader() {

		bar = new ProgressBar.Circle($('#progress-radial').get(0), {
			strokeWidth: 12,
			easing: 'easeOut',
			duration: 200,
			trailColor: '#eee',
			trailWidth: 1,
			from: {color: '#0fb9b1', a:0},
			to: {color: '#20bf6b', a:1},
			svgStyle: null,
			step: function(state, circle) {
				circle.path.setAttribute('stroke', state.color);
			}
		});

		$("#download-button").click(startDownloading)
		$("#stop-button").click(stopDownloading)

		var timestamp = Date.now().toString();
		//$("#output-directory-box").val(timestamp)
	}

	//Previews 4 of the latest downloaded tiles at the .tile-strip tag
	function showTinyTile(base64) {
		//Remove old tiles
		var currentImages = $(".tile-strip img");

		for(var i = 4; i < currentImages.length; i++) {
			$(currentImages[i]).remove();
		}

		var image = $("<img/>").attr('src', "data:image/png;base64, " + base64)

		//Adds new tiles
		var strip = $(".tile-strip");
		strip.prepend(image)
	}

	async function startDownloading() {

		if(draw.getAll().features.length == 0) {
			M.toast({html: 'You need to select a region first.', displayLength: 3000})
			return;
		}

		cancellationToken = false; 
		requests = [];
		missedRequest = [];
		missedTiles = [];
		missedData = [];

		$("#main-sidebar").hide();
		$("#download-sidebar").show();
		$(".tile-strip").html("");
		$("#stop-button").html("STOP");
		removeGrid();
		clearLogs();
		M.Toast.dismissAll();

		var timestamp = Date.now().toString(); //Used for tile file


		var startTime = Date.now(); 
		var showTime = new Date(startTime).toUTCString(); //Used for logger and message

		var allTiles = getAllGridTiles();
		updateProgress(0, allTiles.length);


	var toastHTML= '<div class="sometexts" style="flex-direction : column">Starting download! at : ' + showTime +'<div class="progress"><div class="indeterminate"></div></div></div>';

		M.toast({html: toastHTML, displayLength:9000, classes: 'start'});

		var numThreads = parseInt($("#parallel-threads-box").val());
		var outputDirectory = $("#output-directory-box").val();
		var outputFile = $("#output-file-box").val();
		var outputType = $("#output-type").val();
		var outputScale = $("#output-scale").val();
		var source = $("#source-box").val()

		var bounds = getBounds();
		var boundsArray = [bounds.getSouthWest().lng, bounds.getSouthWest().lat, bounds.getNorthEast().lng, bounds.getNorthEast().lat]
		var centerArray = [bounds.getCenter().lng, bounds.getCenter().lat, getMaxZoom()]
		
		var data = new FormData();
		data.append('minZoom', getMinZoom())
		data.append('maxZoom', getMaxZoom())
		data.append('outputDirectory', outputDirectory)
		data.append('outputFile', outputFile)
		data.append('outputType', outputType)
		data.append('outputScale', outputScale)
		data.append('source', source)
		data.append('timestamp', timestamp)
		data.append('bounds', boundsArray.join(","))
		data.append('center', centerArray.join(","))

		// Initial start of the download phase
		var request = await $.ajax({
			url: "/start-download",
			async: true,
			timeout: 30 * 1000,
			type: "post",
			contentType: false,
			processData: false,
			data: data,
			dataType: 'json',
		})

		let i = 0;
		//Iterates through all the tiles to download.
		var iterator = async.eachLimit(allTiles, numThreads, function(item, done) {

			if(cancellationToken) {
				return;
			}

			var boxLayer = previewRect(item);

			var url = "/download-tile";

			var data = new FormData();
			data.append('x', item.x)
			data.append('y', item.y)
			data.append('z', item.z)
			data.append('quad', generateQuadKey(item.x, item.y, item.z))
			data.append('outputDirectory', outputDirectory)
			data.append('outputFile', outputFile)
			data.append('outputType', outputType)
			data.append('outputScale', outputScale)
			data.append('timestamp', timestamp)
			data.append('source', source)
			data.append('bounds', boundsArray.join(","))
			data.append('center', centerArray.join(","))

			var request = $.ajax({
				"url": url,
				async: true,
				timeout: 30 * 1000,
				type: "post",
			    contentType: false,
			    processData: false,
				data: data,
				dataType: 'json',
			}).done(function(data) { ///this is where tile is being taken from

				if(cancellationToken) {
					return;
				}

				/// The code that differentiate between what has been downloaded or not//
				if(data.code == 200) {
					showTinyTile(data.image)
					logItem(item.x, item.y, item.z, data.message);
				} else {
					logItem(item.x, item.y, item.z, data.code + " Error downloading tile, code is : " + data.code);

					missedTiles.push(item);
					missedRequest.push(self);
					missedData.push(data);

				}

			}).fail(function(data, textStatus, errorThrown) {

				if(cancellationToken) {
					return;
				}

				logItem(item.x, item.y, item.z, "Error while relaying tile");
				missedTiles.push(item);
				missedRequest.push(self);
				missedData.push(data);
				//allTiles.push(item);

			}).always(function(data) {
				i++;

				removeLayer(boxLayer);
				updateProgress(i, allTiles.length);

				done();
				
				if(cancellationToken) {
					M.toast({html: 'Download Canceled!', displayLength:7000, classes: 'cancel'});
					return;
				}
			});

			requests.push(request);

		}, async function(err) {


			logItemRaw("\nAll requests are done!");
			var finishTime = Date.now();
			var showdate = new Date(finishTime).toUTCString();

			logItemRaw("\nTotal elapsed time: " + new Date (finishTime - startTime).getSeconds() + " seconds")
			
			data.append("log",$('#log-view').val())

			var request = await $.ajax({
				url: "/end-download",
				async: true,
				timeout: 30 * 1000,
				type: "post",
				contentType: false,
				processData: false,
				data: data,
				dataType: 'json',
			})

			updateProgress(allTiles.length, allTiles.length);
			

			
			if(validateDownload(data)){
				M.toast({html: 'Finished download! at ' +  showdate, displayLength:7000, classes: 'success'});
			} else {

			}

			//Dev testing checks all the requests, missedTiles and missedRequests
			console.log("all the requests")
			console.dir(requests);
			console.log("all the missiing titles")
			console.dir(missedTiles)
			console.log("all the missed requests")
			console.dir(missedRequest);
			console.log("all the missed datas")
			console.dir(missedData);

			
			

			$("#stop-button").html("FINISH");
		});

	}

	////Validates all requests has been successfull
	function validateDownload(data){
		M.Toast.dismissAll();
		var fails = 0;
		// for (let req of requests){
		// 	console.log("status f req "+req.status)
		// 	if (req.status !== 200){
		// 		fails+=1;
		// 	}
		// }
		
		if (fails !== 0 || missedRequest.length >0){


	var toastHTML = 'Download complications, '+fails+' out of '+ requests.length +' had problems Retry?' +  '<button id="retry"  class="btn-flat toast-action"> Yes </button><button id="noretry" class="btn-flat toast-action"> No </button>';

			M.toast({html: toastHTML, displayLength:10000, classes: 'fail'});
			$("#retry").click(retryDownload)
			$("#noretry").click(function(){M.Toast.dismissAll()})
			return false
		}

		checkfile();
		async function checkfile(data){
		var request = await $.ajax({
			url: "/end-download",
			async: true,
			timeout: 30 * 1000,
			type: "post",
			contentType: false,
			processData: false,
			data: data,
			dataType: 'json',
		}).done(function(data){
			if(data.missFiles.length>0){
				var toastHTML = 'Download complications, '+ data.missTiles.length +' are missing Restart download?' +  '<button id="retry"  class="btn-flat toast-action"> Yes </button><button id="noretry" class="btn-flat toast-action"> No </button>';

			M.toast({html: toastHTML, displayLength:10000, classes: 'fail'});
			$("#retry").click(startDownloading)
			$("#noretry").click(function(){M.Toast.dismissAll()})
				return false
			}
		})
	}
		// var fs = require('fs')
		// var files = fs.read



		return true
	}

	////A retryfunction to download all the missed tiles****
	function retryDownload(){

		var i = 0
		var numThreads = parseInt($("#parallel-threads-box").val());
		var iterator = async.eachLimit(missedTiles, numThreads, function(item, done) {

			if(cancellationToken) {
				return;
			}

			var boxLayer = previewRect(item);

			var url = "/download-tile";

			var data = new FormData();
			data.append('x', item.x)
			data.append('y', item.y)
			data.append('z', item.z)
			data.append('quad', generateQuadKey(item.x, item.y, item.z))
			data.append('outputDirectory', outputDirectory)
			data.append('outputFile', outputFile)
			data.append('outputType', outputType)
			data.append('outputScale', outputScale)
			data.append('timestamp', timestamp)
			data.append('source', source)
			data.append('bounds', boundsArray.join(","))
			data.append('center', centerArray.join(","))

			var request = $.ajax({
				"url": url,
				async: true,
				timeout: 30 * 1000,
				type: "post",
			    contentType: false,
			    processData: false,
				data: data,
				dataType: 'json',
			}).done(function(data) {

				if(cancellationToken) {
					return;
				}

				/// The code that differentiate between what has been downloaded or not//
				if(data.code == 200) {
					showTinyTile(data.image)
					logItem(item.x, item.y, item.z, data.message);

					if (missedRequest.includes(self) && missedTiles.includes(item))
					{
						missedRequest.splice(missedRequest.indexOf(self),1);
						missedTiles.splice(missedTiles.indexOf(item),1);
					}

					
				} else {
					logItem(item.x, item.y, item.z, data.code + " Error downloading tile");

					missedTiles.push(item);
					missedRequest.push(self);

				}

			}).fail(function(data, textStatus, errorThrown) {

				if(cancellationToken) {
					return;
				}

				logItem(item.x, item.y, item.z, "Error while relaying tile");
				missedTiles.push(item);
				missedRequest.push(self);
				//allTiles.push(item);

			}).always(function(data) {
				i++;

				removeLayer(boxLayer);
				updateProgress(i, allTiles.length);

				done();
				
				if(cancellationToken) {
					M.toast({html: 'Download Canceled!', displayLength:7000, classes: 'cancel'});
					return;
				}
			});

			requests.push(request);

		}, async function(err) {

			var request = await $.ajax({
				url: "/end-download",
				async: true,
				timeout: 30 * 1000,
				type: "post",
				contentType: false,
				processData: false,
				data: data,
				dataType: 'json',
			})

			updateProgress(missedTiles.length, missedTiles.length);
			logItemRaw("\nAll requests are done!");
			var finishTime = Date.now();
			var showdate = new Date(finishTime).toUTCString();

		

			logItemRaw("\nTotal elapsed time: " + new Date (finishTime - startTime).getSeconds() + " seconds")

			
			

			//Dev testing checks all the requests, missedTiles and missedRequests
			console.log("all the requests")
			console.dir(requests);
			console.log("all the missiing titles")
			console.dir(missedTiles)
			console.log("all the missed requests")
			console.dir(missedRequest);

			if(validateDownload()){
				M.toast({html: 'Finished download! at ' +  showdate, displayLength:7000, classes: 'success'});
			}


			$("#stop-button").html("FINISH");
		});


	}

	//// animates the circular bar UI alongside changes text based on progress
	function updateProgress(value, total) {
		var progress = value / total;

		bar.animate(progress);
		bar.setText(Math.round(progress * 100) + '<span>%</span>');

		$("#progress-subtitle").html(value.toLocaleString() + " <span>out of</span> " + total.toLocaleString())
	}

	// Sends the corrdiantes of the item that has been downloaded to logger
	function logItem(x, y, z, text) {
		logItemRaw(x + ',' + y + ',' + z + ' : ' + text)
	}

	// Sends input string to the logger
	function logItemRaw(text) {

		var logger = $('#log-view');
		logger.val(logger.val() + '\n' + text);

		logger.scrollTop(logger[0].scrollHeight);
	}

	//Clears logs
	function clearLogs() {
		var logger = $('#log-view');
		logger.val('');
	}

	//Function to stop download by aborting every requests
	function stopDownloading() {
		cancellationToken = true;

		for(var i =0 ; i < requests.length; i++) {
			var request = requests[i];
			try {
				request.abort();
			} catch(e) {

			}
		}

		$("#main-sidebar").show();
		$("#download-sidebar").hide();
		removeGrid();
		clearLogs();

	}

	initializeMaterialize();
	initializeSources();
	initializeMap();
	initializeSearch();
	initializeRectangleTool();
	initializeGridPreview();
	initializeMoreOptions();
	initializeDownloader();
});