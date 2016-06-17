var serverUrl = "https://explaain-api-develop.herokuapp.com";
var apiKey = readCookie("apiKey");
var schemas = {};
var jsonEditorInstance;
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
    console.log(e);
  }
};


$(function() {

  if (!apiKey)
    promptForApiKey();

  JSONEditor.defaults.options.theme = "bootstrap3";
  JSONEditor.defaults.options.iconlib = "fontawesome4";
  JSONEditor.defaults.options.disable_collapse = true;
  JSONEditor.defaults.options.disable_edit_json = true;
  JSONEditor.defaults.options.disable_properties = false;
  JSONEditor.defaults.options.remove_empty_properties = true;
  JSONEditor.defaults.options.disable_array_delete_all_rows = true;
  JSONEditor.defaults.options.disable_array_delete_last_row = true;

  // Fetch all schemas on load (starting with getting a list of them all)
  $.ajax({
    url: serverUrl+"/schemas",
  }).done(function(response) {
    if (!response.schemas)
      return alert("Error: Could not connect to server")
    response.schemas.forEach(function(schemaName) {
      // Fetch each schema
      $.ajax({
        url: serverUrl+"/"+schemaName,
      }).done(function(jsonSchema) {

        $("#newCardBtn .dropdown-menu").append('<li><a href="#" onclick="newCard(\''+schemaName+'\')">'+schemaName+'</a></li>');
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
        url: serverUrl+"/"+schemaName+"/search?q="+encodeURIComponent($('#search input[name="search"]').val()),
      }).done(function(results) {
        searchesReturned++;
        results.forEach(function(result) {
          var type = result['@id'].split("/")[result['@id'].split("/").length-2];
          $("#searchResults").append('<p><button class="btn btn-default" style="text-align: left" onclick="displayCard(\''+result['@id']+'\')"><strong>'+(result.name || "(Untitled)")+'</strong> <span class="text-muted">('+type+')</span></button></p>');
          resultsReturned++;
        });
        if (searchesReturned == Object.keys(schemas).length && resultsReturned == 0)
          $("#searchResults").append('<p class="text-muted">No results</p>');
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

});

/**
 * Methods
 */

function promptForApiKey() {
  var newApiKey = prompt("Please enter your API Key", apiKey);
  if (!newApiKey)
    return;
  apiKey = newApiKey;
  saveCookie("apiKey", newApiKey);
}

function newCard(schemaName) {
  $("#json-editor-container").hide();
  $("#json-editor").removeData('id');
  $("#json-editor").removeData('type');
  $("#json-editor-buttons .btn-delete").attr("disabled", "disabled");
  $("#json-editor-container .messages").html('');
  $.ajax({
    url: serverUrl+"/"+schemaName,
  }).done(function(jsonSchema) {
    $("#json-editor").data('type', schemaName);
    $("#json-editor").html('');
    jsonEditorInstance = new JSONEditor(document.getElementById("json-editor"),
      {
        schema: schemas[schemaName]
      }
    );
    $("#json-editor-container").show().animateCss('zoomIn');
  });
}

function displayCard(uri) {
  $("#json-editor-container .messages").html('');
  $("#json-editor").removeData('id');
  $("#json-editor").removeData('type');
  $("#json-editor-buttons .btn-delete").attr("disabled", "disabled");
  $("#json-editor-container .messages").html();
  var schemaName = uri.split("/")[uri.split("/").length-2];
  $.ajax({
    url: uri
  }).done(function(entity) {
    $("#json-editor").html('');
    $("#json-editor").data('type', schemaName);
    $("#json-editor").data('id', entity['@id']);
    $("#json-editor-buttons .btn-delete").removeAttr("disabled");
    jsonEditorInstance = new JSONEditor(document.getElementById("json-editor"),
      {
        schema: schemas[schemaName],
        startval: entity
      }
    );
    $("#json-editor-container").show().animateCss('zoomIn');
  });
}

function saveCard() {
  $("#json-editor-container .messages").html('');

  var schema = $("#json-editor").data('type');
  var uri = $("#json-editor").data('id');
  if (uri) {
    // Update
    $.ajax({
      type: 'PUT',
      url: uri,
      data: jsonEditorInstance.getValue(),
      headers: {
        'x-api-key': apiKey
      }
    })
    .done(function(entity) {
      previewCallback(uri, 'update');
      updateView(entity['@id']);
      $("#json-editor-container .messages").html('<div class="alert alert-success"><i class="fa fa-fw fa-check"></i> Changes saved</div>');
    })
    .fail(function(err) {
      var message = err.message || "Unable to save changes";
      $("#json-editor-container .messages").html('<div class="alert alert-danger"><i class="fa fa-fw fa-exclamation-circle"></i> '+message+'</div>');
    });
  } else {
    // Create
    $.ajax({
      type: 'POST',
      url: serverUrl+"/"+schema,
      data: jsonEditorInstance.getValue(),
      headers: {
        'x-api-key': apiKey
      }
    })
    .done(function(entity) {
      $("#json-editor").data('id', entity['@id']);
      $("#json-editor-buttons .btn-delete").removeAttr("disabled");
      previewCallback(entity['@id'], 'create');
      updateView(entity['@id']);
      $("#json-editor-container .messages").html('<div class="alert alert-success"><i class="fa fa-fw fa-check"></i> Card created</div>');
    })
    .fail(function(err) {
      var message = err.message || "Unable to create new card";
      $("#json-editor-container .messages").html('<div class="alert alert-danger"><i class="fa fa-fw fa-exclamation-circle"></i> '+message+'</div>');
    });
  }
}

function deleteCard() {
  if (confirm("Are you sure you want to delete this card?\n\nThis action cannot be undone.")) {
    var schema = $("#json-editor").data('type');
    var uri = $("#json-editor").data('id');
    if (!uri)
      return;
    $.ajax({
      type: 'DELETE',
      url: uri,
      headers: {
        'x-api-key': apiKey
      }
    })
    .done(function() {
      previewCallback(uri, 'delete');
      // Custom animation style when deleting a card
      hideCard(false);
      updateView();
    })
    .fail(function(err) {
      var message = err.message || "Unable to delete card";
      $("#json-editor-container .messages").html('<div class="alert alert-danger"><i class="fa fa-fw fa-exclamation-circle"></i> '+message+'</div>');
    });
  }
}

function hideCard(customAnimation) {
  var animation = customAnimation || 'bounceOutUp';
  if (animation === false) {
    $("#json-editor-container").hide();
    $("#json-editor").removeData('id');
    $("#json-editor").removeData('type');
    $("#json-editor-container .messages").html('');
  } else {
    $("#json-editor-container").animateCss(animation, function() {
      $("#json-editor-container").hide();
      $("#json-editor").removeData('id');
      $("#json-editor").removeData('type');
      $("#json-editor-container .messages").html('');
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