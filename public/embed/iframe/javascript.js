/**
 * This Javascript is automatically included in iframes created by explaain.js
 * @version 1.1
 */

// Parse response into JSON object object
var cards = $.parseJSON( document.getElementById("jsonData").innerText  );

// If it's not an array, just make it an array of one object
if (!$.isArray(cards))
  cards = [cards];

var html = '<div class="cards">';
for (var i=0; i < cards.length; i++) {
  html += getCardHtml(cards[i]);
}
html += '</div>';

$('body').append(html);

window.parent.explaain.resizeIframe($('html').attr('id'), $('body').outerHeight(), $('body').outerWidth());

$("body").on("click touch", "a", function(e) {
  e.preventDefault();
  $.ajax({
    url: e.target.href
  })
  .done(function(entity) {
    $('.cards').html('');
    $('.cards').append( getCardHtml(entity) );
    window.parent.explaain.resizeIframe($('html').attr('id'), $('body').outerHeight(), $('body').outerWidth());
  });
  return false;
});

function getCardHtml(card) {
  return '<div class="card slick-slide slick-current slick-center"'
        +' data-uri="'+card['@id']+'"'
        +' style="height: auto; width: 340px;"'
        +' role="option" aria-describedby="slick-slide00">'
        +'   <div class="card-visible">'
        +'     <i class="fa fa-times close" aria-hidden="true"></i><h2>'+card['name']+'</h2>'
        +'     <div class="body-content">'
        +'       '+marked(card['description'])
        +'       </p>'
        +'   </div>'
        +'  </div>'
        +'</div>';
}