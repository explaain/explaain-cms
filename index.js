var express = require('express');
    partials = require('express-partials'),
    ejs = require('ejs'),
    app = express();

app.set('port', (process.env.PORT || 5000));

app.use(express.static(__dirname + '/public'));

// views is directory for all template files
app.set('views', __dirname + '/views');
app.set('view engine', 'ejs');
partials.register('.ejs', ejs);
app.use(partials());

app.get('/', function(request, response) {
  response.render('index', { databaseURI: process.env.DATABASE_URI, appURI: process.env.APP_URI });
});

app.listen(app.get('port'), function() {
  console.log('Node app is running on port', app.get('port'));
});
