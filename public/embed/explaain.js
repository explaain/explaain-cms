/**
 * Include a reference to this script to embed Explaain cards on your site.
 * 
 * This script is cross browser and has no dependancies.
 * @version 1.1
 */
var explaain = new (function() {
  
  var apiServer = "https://explaain-api-develop.herokuapp.com";
  var cssUrl = "https://explaain-cms.herokuapp.com/embed/iframe/stylesheet.css";
  var jQueryUrl = "https://explaain-cms.herokuapp.com/embed/iframe/jquery-3.1.0.min.js";
  var markdownParserUrl = "https://explaain-cms.herokuapp.com/embed/iframe/marked.min.js";
  var iframeJsUrl = "https://explaain-cms.herokuapp.com/embed/iframe/javascript.js";
  
  /**
   * Run on page load
   */
  onPageReady(function() {
    var elements = document.getElementsByClassName("explaain");
    for (var i=0; i < elements.length; i++) {
      var element = elements[i];
      var css = {
        height: element.getAttribute("data-height") || "100%",
        width: element.getAttribute("data-width") || "100%"
      }
      if (element.getAttribute("data-id")) {
        insertIframe(element, element.getAttribute("data-id"), css);
      } else if (element.getAttribute("data-keywords")) {
        // @TODO Search cards other than Headline cards?
        // (Still need to add new API endpoint that searches across all cards)
        insertIframe(element, apiServer+"/Headline/search/?q="+encodeURIComponent(element.getAttribute("data-keywords")), css);
      }
    }
  });

  /**
   * Insert iframe into target
   */
  function insertIframe(target, url, css) {
    var iframeId = getRandomInt(100000, 999999)
    
    var iframe = document.createElement('iframe');
    iframe.id = "iframe-"+iframeId;
    iframe.style.display = "block";
    iframe.style.overflow = "hidden";
    iframe.scrolling = "no";
    iframe.style.border = "none";
    iframe.frameBorder = "0";
    var cssParams = Object.keys(css);
    for (var i=0; i < cssParams.length; i++) {
      iframe.style[cssParams[i]] = css[cssParams[i]]
    }  
    target.appendChild(iframe);

    ajax(url, function(err, response) {
      if (err || !response || response.length == 0)
        return;

      var iframeContents = iframe.contentWindow.document;
      iframeContents.open();
      iframeContents.write('<html id="iframe-'+iframeId+'">');
      iframeContents.write('<link href="'+cssUrl+'" rel="stylesheet" type="text/css"/>');
      iframeContents.write('<link href="https://fonts.googleapis.com/css?family=Lato:400,700,900" rel="stylesheet" type="text/css"/>');
      iframeContents.write('<script src="'+jQueryUrl+'"></script>');
      iframeContents.write('<script src="'+markdownParserUrl+'"></script>');
      iframeContents.write('<div id="jsonData" style="display: none;">'+response+'</div>');
      iframeContents.write('<script src="'+iframeJsUrl+'"></script>');
      iframeContents.close();
    });
  }
  
  this.resizeIframe = function(iframeId, height, width) {
    console.log(height);
    document.getElementById(iframeId).style.height  = height+'px';
    document.getElementById(iframeId).style.width  = width+'px';
  }

  /**
   * Check the page has loaded
   */
  function onPageReady(callback) {
    // If page is already loaded
    if ( document.readyState === "complete" )
      return setTimeout(callback, 1);

    if (document.addEventListener) {
      // Chrome, Firefox, Safari, Opera
      window.addEventListener("load", callback, false);
    } else if (document.attachEvent) {
      // MSIE
      window.attachEvent("onload", callback);
    }
  }

  /**
   * Polyfill for getElementsByClassName
   */
  if (!document.getElementsByClassName) {
    document.getElementsByClassName = function(classname) {
      var elArray = [];
      var tmp = document.getElementsByTagName("*");
      var regex = new RegExp("(^|\\s)" + classname + "(\\s|$)");
      for (var i = 0; i < tmp.length; i++) {
        if (regex.test(tmp[i].className)) {
          elArray.push(tmp[i]);
        }
      }
      return elArray;
    }
  }
  
  /**
   * Polyfill for Object.keys
   */
  if (!Object.keys) {
    Object.keys = function(obj) {
      var keys = [];
      for (var i in obj) {
        if (obj.hasOwnProperty(i)) {
          keys.push(i);
        }
      }
      return keys;
    };
  }
  
  /**
   * Cross browser AJAX request
   */
  function ajax(url, callback, data) {
    try {
      var request = new(this.XMLHttpRequest || ActiveXObject)('MSXML2.XMLHTTP.3.0');
      request.open(data ? 'POST' : 'GET', url, 1);
      request.setRequestHeader('X-Requested-With', 'XMLHttpRequest');
      if (data)
        request.setRequestHeader('Content-type', 'application/x-www-form-urlencoded');
      request.onreadystatechange = function () {
        request.readyState > 3 && callback && callback(null, request.responseText, request);
      };
      request.send(data)
    } catch (e) {
      callback(e);
    }
  }

  function getRandomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1) + min);
  }

  return this;
});
