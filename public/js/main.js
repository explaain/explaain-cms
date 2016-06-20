var gServerUrl = "https://explaain-api-develop.herokuapp.com";
var gApiKey = readCookie("apiKey");
var schemas = {};
var previewCallback = function(id, action) {
  try {
    // Post message to the preview pane to let it now saving worked
    if (window.frames['explaain'].postMessage) {
      // e.g. Safari
      window.frames['explaain'].postMessage({ action: action, id: id }, "*");
    } else if (window.frames['explaain'].contentWindow.postMessage) {
      // e.g. Chrome, Firefox
      window.frames['explaain'].contentWindow.postMessage({ action: action, id: id }, "*");
    }
  } catch (e) {
    console.log("Error sending message to app-preview frame");
    console.log(e);
  }
};


$(function() {
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
        if ($('script[data-template="'+schemaName+'"]').length != 0)
          $("#newCardBtn .dropdown-menu").append('<li><a href="#" onclick="displayCard(null, \''+schemaName+'\')">'+schemaName+'</a></li>');
        
        schemas[schemaName] = jsonSchema;
      });
    });
  });

  window.addEventListener('message', function(event) {
    if (event.data.action = "edit")
      return displayCard(event.data.id);
  }, false);
  
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
        searchesReturned++;
        results.forEach(function(result) {
          var type = result['@id'].split("/")[result['@id'].split("/").length-2];
          $("#searchResults").append('<p><button class="btn btn-default" style="text-align: left" onclick="displayCard(\''+result['@id']+'\')"><strong>'+(result.name || "(Untitled)")+'</strong> <span class="text-muted">('+type+')</span></button></p>');
          resultsReturned++;
        });
        if (searchesReturned == Object.keys(schemas).length && resultsReturned == 0)
          $("#searchResults").append('<p class="lead text-muted" style="padding: 10px;">No results</p>');
      });
    };
    return false;
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
    var a = this.serializeArray();
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
    return o;
  };
  
});

/**
 * Methods
 */

function promptForApiKey() {
  var newApiKey = prompt("Please enter your API Key", gApiKey);
  if (!newApiKey)
    return;
  gApiKey = newApiKey;
  saveCookie("apiKey", newApiKey);
}

function displayCard(uri, schemaName) {
  var cardDialogOptions = {
    title: schemaName,
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
      console.log(this);
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
      if ($('#cards .card[data-id="'+uri+'"]').parents(".ui-dialog").css('visibility') == 'hidden') {
        // If card is hidden, get the latest value of it's contents before making it visible.
        $.ajax({
          url: uri
        }).done(function(entity) {
          // Load template for card based on schema type
          var template = $.templates('script[data-template="'+schemaName+'"]');
      
          entity.description = htmlEncode(entity.description);
          
          // Populate template
          var html = template.render(entity);
          
          // Inject HTML into container
          $('#cards .card[data-id="'+uri+'"]').html(html);

          // Reinitalize textara
          initaliseTextarea($('textarea.mention', $('#cards .card[data-id="'+uri+'"]')));

          // Display card
          $('#cards .card[data-id="'+uri+'"]').parents(".ui-dialog").css({zIndex: highestZIndex+1, visibility: 'visible', opacity: 1}).focus();
        });
      } else {
        // If the card is already visible, just display it (without updating contents)
        $('#cards .card[data-id="'+uri+'"]').parents(".ui-dialog").css({zIndex: highestZIndex+1, visibility: 'visible', opacity: 1}).focus();
      }
      return; 
    }

    // Check we have a template for this schema type
    if ($('script[data-template="'+schemaName+'"]').length == 0)
      return alert("Error: No template defined for "+schemaName+" schema");
    
    $.ajax({
      url: uri
    }).done(function(entity) {

      cardDialogOptions.title = schemaName;
    
      // Load template for card based on schema type
      var template = $.templates('script[data-template="'+schemaName+'"]');

      entity.description = htmlEncode(entity.description);

      // Populate template
      var html = template.render(entity);
  
      // Create new container for card (inside parent) and inject html
      var card = $('<div data-id="'+entity['@id']+'" data-schema="'+schemaName+'" class="card">'+html+'</div>');

      cardDialogOptions.title = schemaName;
      card.dialog(cardDialogOptions);
      
      initaliseTextarea($('textarea.mention', card));
    });
  } else {
    // Display new, blank card
    
    // Check we have a template for this schema type
    if ($('script[data-template="'+schemaName+'"]').length == 0)
      return alert("Error: No template defined for "+schemaName+" schema");
  
    // Load template for card based on schema type
    var template = $.templates('script[data-template="'+schemaName+'"]');
    
    // Populate template
    var html = template.render({});
  
    // Create new container for card (inside parent) and inject html
    var card = $('<div data-schema="'+schemaName+'" class="card">'+html+'</div>');

    cardDialogOptions.title = schemaName;
    card.dialog(cardDialogOptions);
    initaliseTextarea($('textarea.mention', card));
  }
}

function saveCard(card) {
  var schemaName =  $(card).parents(".card").attr('data-schema');
  var uri =  $(card).parents(".card").attr('data-id');
  
  if (uri) {
    // Update existing card
    var formData = $(card).parents('form').serializeObject();
      $('textarea.mention', $(card).parents('form')).mentionsInput('val', function(markdown) {
      if (markdown && markdown != "")
        formData.description = markdown.replace(/##/g, '#');
      $.ajax({
        type: 'PUT',
        url: uri,
        data: formData,
        headers: {
          'x-api-key': gApiKey
        }
      })
      .done(function(entity) {
        previewCallback(uri, 'update');
        updateView(entity['@id']);
      })
      .fail(function(err) {
        var message = err.message || "Unable to save changes";
      });
    });
  } else {
    // Create new card
    var formData = $(card).parents('form').serializeObject();
      $('textarea.mention', $(card).parents('form')).mentionsInput('val', function(markdown) {
      if (markdown && markdown != "")
        formData.description = markdown;
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
        previewCallback(entity['@id'], 'create');
        updateView(entity['@id']);
      })
      .fail(function(err) {
        var message = err.message || "Unable to create new card";
      });
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
      previewCallback(uri, 'delete');
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
    })
    .fail(function(err) {
      var message = err.message || "Unable to delete card";
    });
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
  var defaultValue = htmlDecode(textarea.text());
  textarea.mentionsInput({
    elastic: false,
    showAvatars: false,
    defaultValue: defaultValue,
    onDataRequest: function(mode, query, callback) {
      // @FIXME: Can currently only link to "Detail" schemas; am going to create
      // endpoint in the API to cope with searching across multiple collections.
      $.ajax({
        url: gServerUrl+"/Detail/search?q="+encodeURIComponent(query),
      }).done(function(results) {
        var suggestions = results;
        suggestions.forEach(function(suggestion) {
          suggestion.id = suggestion['@id'];
          suggestion.type = 'link';
        });
        suggestions = _.filter(suggestions, function(suggestion) { return suggestion.name.toLowerCase().indexOf(query.toLowerCase()) > -1 });
        callback.call(this, suggestions);
      });
    }
  });
}

function htmlEncode(value){
  return $('<div/>').text(value).html();
}

function htmlDecode(value){
  return $('<div/>').html(value).text();
}