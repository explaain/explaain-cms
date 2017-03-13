/**
 * Code for the Explaain CMS
 *
 * This code is all in one file and is somewhat hacky just to prove the concept.
 */


console.log('databaseURI', databaseURI);

// Set the API server to dev (default) or live (if acessing via live CMS URL)
var gServerHost= "api.dev.explaain.com";
if (window.location.hostname == "cms.explaain.com")
  gServerHost = "api.explaain.com";

//Replaces everything above if databaseURI config variable is set
if (databaseURI)
  gServerHost = databaseURI;

var gServerUrl = "http://"+gServerHost;

var gApiKey = readCookie("apiKey");
var gContextMenuTarget = null;
var schemas = {};

//DD
//SECURITY RISK: this contains Write API Key so should be in backend


var Client = algoliasearch('I2VKMNNAXI', 'cc48ccb52b8d7b7bfcd4aa6790e0dca4',{
	protocol: 'https:'
});
var AlgoliaIndex = Client.initIndex('cards');


//Add Airtable endpoint
var airtableEndpoint = "https://api.airtable.com/v0/app0tlZDi3cEALxhe/"+airtableTable;



var sendMessageToPreviewFrame = function(key, action) {
  try {
    // Post message to the preview pane to let it now saving worked
    if (window.frames['explaain'].postMessage) {
      // e.g. Safari
      window.frames['explaain'].postMessage({ action: action, key: key }, "*");
    } else if (window.frames['explaain'].contentWindow.postMessage) {
      // e.g. Chrome, Firefox
      window.frames['explaain'].contentWindow.postMessage({ action: action, key: key }, "*");
    }
  } catch (e) {
    console.log("Error sending message to app-preview frame");
    console.log(e);
  }
};

$(function() {

  // Display server URL in bottom left of the window
  $("#server-url").text("Connected to "+gServerUrl);
  // Load the app in an iframe and tell it connect to the same API server we are connected to
  $("#explaain").attr("src", "http://" + appURI + "?editing=true&source="+encodeURIComponent(gServerUrl));

  if (!gApiKey)
    promptForApiKey();

  // Fetch all schemas on load (starting with getting a list of them all)
  $.ajax({
    url: gServerUrl+"/schemas",
  }).done(function(response) {
    if (!response.schemas)
      return alert("Error: Could not connect to server")
    response.schemas.forEach(function(schemaName) {
      // Fetch each schema
      $.ajax({
        url: gServerUrl+"/"+schemaName,
      }).done(function(jsonSchema) {

        // If we have a template for this schema add it to the New Card dropdown
        if ($('script[data-template="'+schemaName+'"]').length != 0) {
          $("#newCardBtn .dropdown-menu").append('<li><a href="#" onclick="showCard(null, \''+schemaName+'\')">'+schemaName+'</a></li>');
          $("#newCardContextMenu").append('<li><a href="#" onclick="hideContextMenu(); showCard(null, \''+schemaName+'\', true)"><i class="fa fa-fw fa-plus-circle"></i> Add '+schemaName+'</a></li>');
        }

        schemas[schemaName] = jsonSchema;
      });
    });
  });

  window.addEventListener('message', function(event) {
    if (event.data.action = "edit")
      return showCard(event.data.id);
  }, false);

  // Intercept the search box
  $("#search").submit(function(e) {
    e.preventDefault();

    $("#searchResults").html('');

    var searchesReturned = 0;
    var resultsReturned = 0;

    // Search
    for (var schemaName in schemas) {
      $.ajax({
        url: gServerUrl+"/"+schemaName+"/search?q="+encodeURIComponent($('#search input[name="search"]').val()),
      }).done(function(results) {
        results = archiveDuplicates(results);
        searchesReturned++;
        results.forEach(function(result) {
          var type = result['@id'].split("/")[result['@id'].split("/").length-2];
          $("#searchResults").append('<p><button class="btn btn-default" style="text-align: left" onclick="showCard(\''+result['@id']+'\')"><strong>'+(result.name || "(Untitled)")+'</strong> <span class="text-muted">('+type+')</span></button></p>');
          resultsReturned++;
        });
        if (searchesReturned == Object.keys(schemas).length && resultsReturned == 0)
          $("#searchResults").append('<p class="lead text-muted" style="padding: 10px;">No results</p>');
      });
    };
    return false;
  });

  // Intercept the *context menu* search box
  $('#contextmenu #addLinkContextMenu input[name="search"]').keyup(function(e) {
    if (e.keyCode == 13) {
      e.preventDefault();
      suggestLinksInContextMenu();
      return false;
    }
  });

  $.fn.extend({
    animateCss: function(animationName, callback) {
      var context = this;
      var animationEnd = 'webkitAnimationEnd mozAnimationEnd MSAnimationEnd oanimationend animationend';
      $(this).addClass('animated ' + animationName).one(animationEnd, function() {
        $(this).removeClass('animated ' + animationName);
        if (callback)
          callback(null, context)
      });
      return this;
    }
  });

  $.fn.serializeObject = function(){
    var o = {};
    console.log(this);
    var a = this.serializeArray();
    console.log(a);
    $.each(a, function() {
      if (o[this.name] !== undefined) {
        if (!o[this.name].push) {
          o[this.name] = [o[this.name]];
        }
        o[this.name].push(this.value || '');
      } else {
        o[this.name] = this.value || '';
      }
    });
    console.log(JSON.stringify(o));
    return o;
  };

  // Handle focusing cards when child element (e.g. input field) has focus
  var handle = ally.style.focusWithin();

  $(document).click(function(event) {
    // Clicking anywhere outside of the context menu when it is visible
    // should hide it.
    if (!$(event.target).closest('#contextmenu').length && $('#contextmenu').is(":visible")) {
      if (gContextMenuTarget && gContextMenuTarget.getAttribute('href') == "#")
          removeLink();
      $('#contextmenu').hide();
    }
  })

  $("#newCardContextMenuBtn").bind('click touch', function(e) {
    $("#newCardContextMenuBtn .dropdown-menu").toggle();
  });

});

/**
 * Methods
 */

function promptForApiKey() {
  var newApiKey = prompt("Please enter your API Key", gApiKey);
  if (!newApiKey)
    return;
  gApiKey = newApiKey;
  saveCookie("apiKey", newApiKey, 1000);
}

function showCard(uri, schemaName, linkToSelectContextMenuTarget) {
  var cardDialogOptions = {
    title: schemaName+" Card",
    appendTo: "#cards",
    minWidth: 500,
    // Overriding jQuery UI close behaviour because it's buggy :(
    // We use opacity *as well as visibility* to better override CSS transitions
    // on elements that can otherwise cause the card to disappear 'oddly'.
    // Hiding and re-showing a card has the benifit that cards remember their
    // last positions. A downside is a cards contents could be stale, but that
    // can be easily addressed in a future update - and is something we'd
    // want to handle anyway with server side events in case a card is updated
    // by someone else on another browser!
    beforeClose: function(event, ui) {

      if (!event.metaKey && !event.ctrlKey && !confirm("Are you sure you want to close this card?")) {
        return false;
      };

      $(this).parents(".ui-dialog").css({visibility: 'hidden', opacity: 0, zIndex: 0});

      // Move focus to card with highest zIndex
      var highestZIndex = 0;
      var cardWithHighestZIndex = null;
      $("#cards .ui-dialog").each(function() {
        var zIndex = parseInt($(this).css("zIndex"), 10);
        if (zIndex > highestZIndex) {
          highestZIndex = zIndex;
          cardWithHighestZIndex = this;
        }
      });
      if (cardWithHighestZIndex)
        $(cardWithHighestZIndex).focus();

      event.preventDefault();
      return false;
    }
  };

  if (uri) {
    // Display existing card

    if (!schemaName)
      schemaName = uri.split("/")[uri.split("/").length-2];

    // If card with that URI is already displayed, bubble it up to the top
    if ($('#cards .card[data-id="'+uri+'"]').length > 0) {
      // Loop through all visible cards and get the current highest zIndex value
      // Starting with z-Index of at least 10 to make sure it displays above
      // other elements in the same area, such as search results.
      var highestZIndex = 10;
      $("#cards .ui-dialog").each(function() {
        var zIndex = parseInt($(this).css("zIndex"), 10);
        if (zIndex > highestZIndex)
          highestZIndex = zIndex;
      });

      // Check if card is visible or not
      //if ($('#cards .card[data-id="'+uri+'"]').parents(".ui-dialog").css('visibility') == 'hidden') {
      //}
      // Get the latest value of it's contents before making it visible.
      $.ajax({
        url: uri
      }).done(function(entity) {
        // Load template for card based on schema type
        var template = $.templates('script[data-template="'+schemaName+'"]');

        entity.id = entity['@id'];
        entity.links = (entity.links) ? entity.links.join(',') : [];

        var markdownFields = [
          'description',
          'caption',
          'moreDetail',
          'question',
          'answer1',
          'answer2',
          'answer3',
          'answer4'
        ]

        for (i in markdownFields) {
          var value = markdownFields[i];
          if (entity[value]) {
            entity[value] = marked(entity[value]);
          }
        }

        var encodeFields = [
          'embedCode'
        ]

        for (i in encodeFields) {
          var value = encodeFields[i];
          if (entity[value]) {
            console.log(entity[value]);
            entity[value] = decodeURIComponent(entity[value]).replace(/"/g, '&quot;');
            console.log(entity[value]);
          }
        }

        // Populate template
        var html = template.render(entity);

        // Inject HTML into container
        $('#cards .card[data-id="'+uri+'"]').html(html);

        // Reinitalize textara
        initaliseTextarea($('.textarea', $('#cards .card[data-id="'+uri+'"]')));

        $('.textarea a[href]:not("\\#")', card).popover({
           placement: 'right',
           trigger: 'hover',
           html: true,
           content: '…'
         });

        // Display card
        $('#cards .card[data-id="'+uri+'"]').parents(".ui-dialog").css({zIndex: highestZIndex+1, visibility: 'visible', opacity: 1}).focus();
      });

      return;
    }

    // Check we have a template for this schema type
    if ($('script[data-template="'+schemaName+'"]').length == 0)
      return console.log("Display Card Error: No template defined for "+schemaName+" schema");

    $.ajax({
      url: uri
    }).done(function(entity) {

      cardDialogOptions.title = schemaName+" Card";

      // Load template for card based on schema type
      var template = $.templates('script[data-template="'+schemaName+'"]');

      entity.id = entity['@id'];
      entity.links = (entity.links) ? entity.links.join(',') : [];

      var markdownFields = [
        'description',
        'caption',
        'moreDetail',
        'question',
        'answer1',
        'answer2',
        'answer3',
        'answer4'
      ]

      for (i in markdownFields) {
        var value = markdownFields[i];
        if (entity[value]) {
          entity[value] = marked(entity[value]);
        }
      }

      var encodeFields = [
        'embedCode'
      ]

      for (i in encodeFields) {
        var value = encodeFields[i];
        if (entity[value]) {
          console.log(entity[value]);
          entity[value] = decodeURIComponent(entity[value]).replace(/"/g, '&quot;');
          console.log(entity[value]);
        }
      }

      // Populate template
      var html = template.render(entity);

      // Create new container for card (inside parent) and inject html
      var card = $('<div data-id="'+entity['@id']+'" data-schema="'+schemaName+'" class="card">'+html+'</div>');

      card.dialog(cardDialogOptions);

      initaliseTextarea($('.textarea', card));

      $('.textarea a[href]:not("\\#")', card).popover({
         placement: 'right',
         trigger: 'hover',
         html: true,
         content: '…'
       });

    });
  } else {
    // Display new, blank card

    // Check we have a template for this schema type
    if ($('script[data-template="'+schemaName+'"]').length == 0)
      return console.log("Display New Card Error: No template defined for "+schemaName+" schema");

    // Load template for card based on schema type
    var template = $.templates('script[data-template="'+schemaName+'"]');

    // Populate template
    var html = template.render({
      id: "No ID assigned yet",
      name: gContextMenuTarget ? gContextMenuTarget.innerText || "" : ""
    });

    // Create new container for card (inside parent) and inject html
    var card = $('<div data-schema="'+schemaName+'" class="card">'+html+'</div>');

    cardDialogOptions.title = schemaName+" Card";
    card.dialog(cardDialogOptions);
    initaliseTextarea($('.textarea', card));

    $('.textarea a[href]:not("\\#")', card).popover({
       placement: 'right',
       trigger: 'hover',
       html: true,
       content: '…'
     });

    if (linkToSelectContextMenuTarget === true) {
      // @FIXME Super hacky, but waits before saving card otherwise it might
      // not have been rendered yet. There isn't a call back we can use :-(
      // but we should really test the DOM to see if the card is actually ready.
      setTimeout(function() {
        saveCard($("button", card), function(err, entity) {
          changeContentMenuTargetLink(entity['@id']);
        });
      }, 500);
    }
  }
}

function saveCard(card, callback) {
  var schemaName =  $(card).parents(".card").attr('data-schema');
  var uri =  $(card).parents(".card").attr('data-id');

  if (uri) {
    // Update existing card
    console.log($(card).parents('form'));
    var formData = $(card).parents('form').serializeObject();

    console.log(formData);

    var markdownFields = [
      'description',
      'caption',
      'moreDetail',
      'question',
      'answer1',
      'answer2',
      'answer3',
      'answer4'
    ]

    for (i in markdownFields) {
      var value = markdownFields[i];
      formData[value] = $('.textarea[-data-name="' + value + '"]', $(card).parents('form')).html();
      if (formData[value]) {
        formData[value] = toMarkdown(formData[value]);
      }
    }
    console.log(formData);

    var encodeFields = [
      'embedCode'
    ]

    for (i in encodeFields) {
      var value = encodeFields[i];
      if (formData[value]) {
        formData[value] = encodeURIComponent(formData[value].replace(/"/g, '&quot;'));
      }
    }

    console.log(formData);

    formData.links = [];
    $("a", $('.textarea[-data-name="description"]', $(card).parents('form'))).each(function(){
      if (formData.links.indexOf(this.href) == -1)
        formData.links.push(this.href);
    });

    console.log(formData);

    formData.archive = true;

    $.ajax({
      type: 'PUT',
      url: uri,
      data: formData,
      headers: {
        'x-api-key': gApiKey
      }
    })
    .done(function(entity) {
      sendMessageToPreviewFrame(uri, 'update');
      updateView(entity['@id']);
      toast("Card saved", "success");
      if (callback)
        return callback(null, entity)

      // Update card in airtable
      updateAirtable('update', entity);
	  //DD
	  updateAlgolia('saveObjects', entity);
    })
    .fail(function(err) {
      var message = err.message || "Unable to save changes";
      toast(message, "error");
      if (callback)
        return callback(message, entity)
    });

  } else {
    // Create new card
    var formData = $(card).parents('form').serializeObject();

    var markdownFields = [
      'description',
      'caption',
      'moreDetail',
      'question',
      'answer1',
      'answer2',
      'answer3',
      'answer4'
    ]

    for (i in markdownFields) {
      var value = markdownFields[i];
      formData[value] = $('.textarea[-data-name="' + value + '"]', $(card).parents('form')).html();
      if (formData[value]) {
        formData[value] = toMarkdown(formData[value]);
      }
    }


    var encodeFields = [
      'embedCode'
    ]

    for (i in encodeFields) {
      var value = encodeFields[i];
      if (formData[value]) {
        formData[value] = encodeURIComponent(formData[value].replace(/"/g, '&quot;'));
      }
    }

    formData.links = [];
    $("a", $('.textarea[-data-name="description"]', $(card).parents('form'))).each(function(){
      if (formData.links.indexOf(this.href) == -1)
        formData.links.push(this.href);
    });

    console.log(formData);

    $.ajax({
      type: 'POST',
      url: gServerUrl+"/"+schemaName,
      data: formData,
      headers: {
        'x-api-key': gApiKey
      }
    })
    .done(function(entity) {
      $(card).parents(".card").attr('data-id', entity['@id']);
      $('input[name="id"]', $(card)).val(entity['@id']);

      showCard(entity['@id']);

      sendMessageToPreviewFrame(entity['@id'], 'create');
      updateView(entity['@id']);
      toast("Card created", "success");
      if (callback)
        return callback(null, entity)

      // Add new card to airtable
      updateAirtable('create', entity);
	  //DD
	  updateAlgolia('addObjects', entity) ;
    })
    .fail(function(err) {
      var message = err.message || "Unable to create new card";
      toast(message, "error");
      if (callback)
        return callback(message, entity)
    });
  }
}

function deleteCard(card) {
  if (confirm("Are you sure you want to delete this card?\n\nThis action cannot be undone.")) {
    var uri =  $(card).parents(".card").attr('data-id');

    if (!uri)
      return $(card).parents(".ui-dialog").css({visibility: 'hidden', opacity: 0, zIndex: 0});

    $.ajax({
      type: 'DELETE',
      url: uri,
      headers: {
        'x-api-key': gApiKey
      }
    })
    .done(function() {
      sendMessageToPreviewFrame(uri, 'delete');
      // @FIXME Should delete the card here but jQuery is buggy and incorrectly
      // redraws other dialogs when you do remove elements, so fudging by just
      // hiding elements for now.
      $(card).parents(".ui-dialog").css({visibility: 'hidden', opacity: 0, zIndex: 0});
      updateView(uri);

      // Move focus to card with highest zIndex
      var highestZIndex = 0;
      var cardWithHighestZIndex = null;
      $("#cards .ui-dialog").each(function() {
        var zIndex = parseInt($(this).css("zIndex"), 10);
        if (zIndex > highestZIndex) {
          highestZIndex = zIndex;
          cardWithHighestZIndex = this;
        }
      });
      if (cardWithHighestZIndex)
        $(cardWithHighestZIndex).focus();

      // Delete card from airtable
      updateAirtable('delete', {'@id': uri});
	  //DD
	  updateAlgolia ('deleteObjects', {'@id': uri});
	  
      toast("Card deleted", "success");
    })
    .fail(function(err) {
      var message = err.message || "Unable to delete card";
      toast(message, "error");
    });
  }
}

$('#uploadbutton').click(function(){
  $('input[type=file]#upload').click();
});

$('input[type=file]#upload').change(function() {
  $('input[type=file]#upload').parse({
    config: {
      delimiter: "",	// auto-detect
      newline: "",	// auto-detect
      quoteChar: '"',
      header: true,
      dynamicTyping: false,
      preview: 0,
      encoding: "",
      worker: false,
      comments: false,
      step: undefined,
      complete: function(results, file) {
        createMultipleCards(results.data);
        $("input[type=file]#upload").replaceWith($("input[type=file]#upload").val('').clone(true));
        toast("File uploaded!", "success");
      },
      error: undefined,
      download: false,
      skipEmptyLines: false,
      chunk: undefined,
      fastMode: undefined,
      beforeFirstChunk: undefined,
      withCredentials: undefined
    },
    before: function(file, inputElem)
    {
      // executed before parsing each file begins;
      // what you return here controls the flow
    },
    error: function(err, file, inputElem, reason)
    {
      // executed if an error occurs while loading the file,
      // or if before callback aborted for some reason
    },
    complete: function()
    {
      // executed after all files are complete
    }
  });
});


function createMultipleCards(cards) {

  cards.forEach(function(card) {
    var schemaName = card.type;

    geturl = new RegExp(
          "\(((ftp|http|https|gopher|mailto|news|nntp|telnet|wais|file|prospero|aim|webcal):(([A-Za-z0-9$_.+!*(),;\/?:@&~=-])|%[A-Fa-f0-9]{2}){2,}(#([a-zA-Z0-9][a-zA-Z0-9$_.+!*(),;\/?:@&~=%-]*))?([A-Za-z0-9$_+!*();\/?:~-]))\)"
         ,"g"
       );
    card.links = card.description.match(geturl) || [];
    card.links.forEach(function(link, i) {
      card.links[i] = link.substring(0, link.length - 1);
    });

    console.log(card);

    $.ajax({
      type: 'POST',
      url: gServerUrl+"/"+schemaName,
      data: card,
      headers: {
        'x-api-key': gApiKey
      }
    })
    .done(function(entity) {
      updateView();
      // toast("Card created", "success");

      // Add new card to airtable
      updateAirtable('create', entity);
	  //DD
	  updateAlgolia('addObjects', entity);
    })
    .fail(function(err) {
      var message = err.message || "Unable to create new card";
      toast(message, "error");
    });
  });
}


function updateAirtable(type, data) {
  switch (type) {
    case 'create':
        var airtableCreateEndpoint = airtableEndpoint + "?api_key=" + airtableApiKey;
        axios.post(airtableCreateEndpoint, {
          "fields": {
            "Card URL": data['@id'],
            "Name": data.name,
            "Description": data.description,
            "Type": data['@type']
          }
        });
      break;

    case 'update':
        var airtableListEndpoint = airtableEndpoint + "?api_key=" + airtableApiKey + '&filterByFormula=' + encodeURIComponent('{Card URL}="' + data['@id'] + '"');
        axios.get(airtableListEndpoint)
          .then(function(result) {
            if (result.data.records.length) {
              var airtableID = result.data.records[0].id;
              airtableUpdateEndpoint = airtableEndpoint + '/' + airtableID + "?api_key=" + airtableApiKey;
              axios.patch(airtableUpdateEndpoint, {
                "fields": {
                  "Card URL": data['@id'],
                  "Name": data.name,
                  "Description": data.description,
                  "Type": data['@type']
                }
              });
            } else {
              updateAirtable('create', data);
            }
          });
      break;

    case 'delete':
        var airtableListEndpoint = airtableEndpoint + "?api_key=" + airtableApiKey + '&filterByFormula=' + encodeURIComponent('{Card URL}="' + data['@id'] + '"');
        axios.get(airtableListEndpoint)
          .then(function(result) {
            var airtableID = result.data.records[0].id;
            airtableDeleteEndpoint = airtableEndpoint + '/' + airtableID + "?api_key=" + airtableApiKey;
            axios.delete(airtableDeleteEndpoint);
          });
      break;
  }
}
//DD
function updateAlgolia(type,data){
	switch (type){
	
	case 'addObjects':
		var cards = [{
			objectID : data['@id'],
			name: data.name,
			description: data.description,
			type: data['@type']
		}];
		AlgoliaIndex.addObjects(cards, function(err, content) {
			if (err){
				console.log(err);
			}
		});
	
	break;
	
	case 'saveObjects':
			var cards = [{
				objectID : data['@id'],
				name: data.name,
				description: data.description,
				type: data['@type']
			}];
			AlgoliaIndex.saveObjects(cards, function(err, content) {
				if (err) {
					console.log(err);
				}
			});		
			
	
	break;
	
	
	case 'deleteObjects':
		AlgoliaIndex.deleteObjects([data['@id']], function(err, content) {
			if (err){
				console.log(err);
			}
		});
		
	break;
	}
}
function getAirtableRecordID(cardURL) {
  airtableListEndpoint = airtableEndpoint + "?api_key=" + airtableApiKey+'&filterByFormula="{Card%20URL}='+cardURL+'"';
  axios.get(airtableListEndpoint)
    .then(function(result) {
      var airtableID = result.data.records[0].id;
      airtableDeleteEndpoint = airtableEndpoint + '/' + airtableID + "?api_key=" + airtableApiKey;
      axios.delete(airtableDeleteEndpoint);
    });
}


function previewCard(card) {
  var uri =  $(card).parents(".card").attr('data-id');
  if (!uri) {
    // If no URI, save the card (to generate one) and then preview it
    saveCard(card, function(err, entity) {
      sendMessageToPreviewFrame(entity['@id'], 'open');
    });
  } else {
    sendMessageToPreviewFrame(uri, 'open');
  }
}

function saveCookie(cookieName, value, days) {
  var expires = "";
  if (days) {
    var date = new Date();
    date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
    var expires = "; expires=" + date.toGMTString();
  }
  document.cookie = cookieName + "=" + value + expires + "; path=/";
}

function readCookie(cookieName) {
  var nameEQ = cookieName + "=";
  var ca = document.cookie.split(';');
  for (var i = 0; i < ca.length; i++) {
    var c = ca[i];
    while (c.charAt(0) == ' ') c = c.substring(1, c.length);
    if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length, c.length);
  }
  return null;
}

function updateView(id) {
  if ($("#searchResults").html() != "")
    $("#search").submit();
}

function initaliseTextarea(textarea) {

  textarea.toTextarea({
    allowHTML: false,//allow HTML formatting with CTRL+b, CTRL+i, etc.
    allowImg: false,//allow drag and drop images
    singleLine: false,//make a single line so it will only expand horizontally
    pastePlainText: true,//paste text without styling as source
    placeholder: false//a placeholder when no text is entered. This can also be set by a placeholder="..." or data-placeholder="..." attribute
  });


  // Detect if marked block in textarea was clicked
  textarea.bind('click touch', function(e){
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (el.tagName == "A") {
      showCard(el.href);
    }
  });

  // Detect if marked block in textarea was RIGHT clicked
  textarea.bind('contextmenu', function(e){
    e.preventDefault();
    var selection = document.getSelection();
    var range = selection.getRangeAt(0);
    var selectedText = selection.toString()

    // Do nothing if no text selected
    if (selectedText.length === 0)
      return;

    var response;
    var el = document.elementFromPoint(e.clientX, e.clientY);
    if (el.tagName == "A") {

      showContextMenu('editLinkContextMenu', el);
      clearSelection();
      return;
    } else {
      range.deleteContents();
      var a = document.createElement("a");
      a.href = "#";
      a.innerText = selectedText;
      range.insertNode(a);

      showContextMenu('addLinkContextMenu', a);
      return;
    }
  });

}

function htmlEncode(value){
  return $('<div/>').text(value).html();
}

function htmlDecode(value){
  return $('<div/>').html(value).text();
}

function toast(message, type) {
  toastr.options = {
    "closeButton": false,
    "debug": false,
    "newestOnTop": false,
    "progressBar": true,
    "positionClass": "toast-bottom-left",
    "preventDuplicates": false,
    "onclick": null,
    "showDuration": "300",
    "hideDuration": "1000",
    "timeOut": "1000",
    "extendedTimeOut": "1000",
    "showEasing": "swing",
    "hideEasing": "linear",
    "showMethod": "fadeIn",
    "hideMethod": "fadeOut"
  };

  toastr[type](message);
}


function getSelectedParentNode(range) {
  var selectedElement = null;
  if (rangeSelectsSingleNode(range)) {
    // Selection encompasses a single element
    selectedElement = range.startContainer.childNodes[range.startOffset];
  } else if (range.startContainer.nodeType === 3) {
    // Selection range starts inside a text node, so get its parent
    selectedElement = range.startContainer.parentNode;
  } else {
    // Selection starts inside an element
    selectedElement = range.startContainer;
  }
  return selectedElement;
}

// http://stackoverflow.com/questions/15867542/range-object-get-selection-parent-node-chrome-vs-firefox
function rangeSelectsSingleNode(range) {
    var startNode = range.startContainer;
    return startNode === range.endContainer &&
           startNode.hasChildNodes() &&
           range.endOffset === range.startOffset + 1;
}

function showContextMenu(contextMenuId, target) {

  // If no target but there is an old target, use the last target
  if (!target && target !== false && gContextMenuTarget)
    target = gContextMenuTarget;

  // If there is still no target then return
  // @TODO Display at current mouse location
  if (!target)
    return;

  var viewportOffset = target.getBoundingClientRect();
  x = viewportOffset.left;
  y = viewportOffset.bottom;

  // Hide + reset menu
  $("#contextmen").hide();
  $("#contextmenu ul").hide();
  $('#contextmenu #addLinkContextMenu input[type="text"]').val(target.innerText);
  $("#contextmenu #addLinkContextMenu li.searchResult").remove();

  gContextMenuTarget = target;
  console.log(gContextMenuTarget);

  // Show menu
  $("#contextmenu #"+contextMenuId).show();
  $("#contextmenu").css({left: x, top: y}).show();
  $("#contextmenu #"+contextMenuId+' input[type="text"]').focus();

  suggestLinksInContextMenu();
}

function hideContextMenu() {
  $("#contextmen").hide();
  $("#contextmenu ul").hide();
  $('#contextmenu #addLinkContextMenu input[type="text"]').val('');
  $("#contextmenu #addLinkContextMenu li.searchResult").remove();
}

function clearSelection() {
  window.getSelection().removeAllRanges();
}

function removeLink() {
  gContextMenuTarget.parentNode.insertBefore(document.createTextNode(gContextMenuTarget.innerText), gContextMenuTarget.nextSibling);
  gContextMenuTarget.remove();
  hideContextMenu();
}

function changeContentMenuTargetLink(url) {
  gContextMenuTarget.href = url;
  hideContextMenu();
}

// Intercept the *context menu* search box
function suggestLinksInContextMenu() {
  // Clear existing results
  $("#contextmenu #addLinkContextMenu li.searchResult").remove();

  if ($('#contextmenu #addLinkContextMenu input[name="search"]').val().length == 0)
    return;

  var searchesReturned = 0;
  var resultsReturned = 0;

  // Search
  for (var schemaName in schemas) {
    $.ajax({
      url: gServerUrl+"/"+schemaName+"/search?q="+encodeURIComponent($('#contextmenu #addLinkContextMenu input[name="search"]').val()),
    }).done(function(results) {
      searchesReturned++;
      results.forEach(function(result) {
        var type = result['@id'].split("/")[result['@id'].split("/").length-2];
        $('<li class="searchResult">'
          +'<a href="#" onclick="changeContentMenuTargetLink(\''+result['@id']+'\')">'
          +'<i class="fa fa-caret-right"></i> '+(result.name || "(Untitled)")+'</a></li>')
          .insertAfter("#contextmenu #addLinkContextMenu > li:first-child");
        resultsReturned++;
      });
    });
  };
}

var tmp = $.fn.popover.Constructor.prototype.show;
$.fn.popover.Constructor.prototype.show = function() {
  tmp.call(this);
  var popover = $(this.$tip)[0];
  $.ajax({
    url: $(this.$element)[0].href
  })
  .done(function(entity) {
    $(".popover-content", popover).text(entity.name);
  })
  .fail(function(err) {
    $(".popover-content", popover).html('<i class="fa fa-chain-broken"></i> Card not found!');
  });
  if (this.options.callback) {
    this.options.callback();
  }
};




function archiveDuplicates(cards) {
  var cardCollection = [];
  $.each(cards, function(i, card) {
    var dup = $.grep(cardCollection, function(c) {
      return c.name == card.name;
    });
    if (dup.length) {
      var cardToArchive = dup[0];
      if (Object.keys(dup[0]).length > Object.keys(card).length) {
        cardToArchive = card;
      }
      cardToArchive.archive = true;
      $.ajax({
        type: 'PUT',
        url: cardToArchive['@id'],
        data: cardToArchive,
        headers: {
          'x-api-key': gApiKey
        }
      })
    } else {
      cardCollection.push(card);
    }
  });
  return cardCollection;
}

function archiveCard(uri) {

}
