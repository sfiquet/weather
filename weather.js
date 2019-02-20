(function(){

  let autocomplete;
  let actionDate = 0; // time stamp for current action
  let watchid;  // for geolocation
  let xhrWeather;
  let localesSupport = toLocaleStringSupportsLocales();

// getLocation uses watchPosition rather than getCurrentPosition in order
// to be able to cancel the geolocation if a new action is triggered by the user
  function getLocation(timestamp){
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation){
        reject("Geolocation is not supported");

      } else {
        displayInfoMessage('Getting current location...');

        watchid = navigator.geolocation.watchPosition(
          (position) => {
            resetLocationWatch();
            resolve({
              latitude: position.coords.latitude, 
              longitude: position.coords.longitude, 
              timestamp: timestamp
            });
          }, 
          (err) => {
            resetLocationWatch();
            reject(`Can't get current location: ${err.message}`);
          });
      }
    });
  }
  
  // stop keeping track of the position
  // needs to be called when watchPosition ends
  // and also when a new user-triggered action starts
  function resetLocationWatch(){
    if (watchid !== undefined){
      navigator.geolocation.clearWatch(watchid);
      watchid = undefined;
    }
  }

  function getWeather(coords){
    return new Promise((resolve, reject) => {
      let settings = {
        url: 'https://fcc-weather-api.glitch.me/api/current',
        dataType: 'json',
        data: {
          lon: coords.longitude,
          lat: coords.latitude
        }
      };

      // ignore if old action
      if (coords.timestamp && coords.timestamp < actionDate){
        setTimeout(function(){
          reject('ignore');
        }, 0);
        return;
      }
      
      displayInfoMessage(coords.name ? `Getting weather data for ${coords.name}...` : 'Getting weather data...');

      xhrWeather = $.ajax(settings)
        .done(function(data){
          // reject as obsolete if another action was started since this one was fired
          if (coords.timestamp && coords.timestamp < actionDate){
            reject('ignore');

          } else {
            // replace the place name from the weather API by the name from the autocomplete
            // (if provided) as it's more meaningful to the user
            if (coords.name){
              data.name = coords.name;
            }
            resolve(data);
          }
        })
        .fail(function(jqXHR, textStatus, error){
          // we're going to ignore obsolete queries that failed
          // normally the query fails because abort was called
          // although sometimes an obsolete query fails for some other reason
          // (the response was already on the way back when the abort happened)
          // timestamps deal with both situations
          if (coords.timestamp && coords.timestamp < actionDate){
            reject('ignore');

          // normal case: current query that failed
          } else {
            reject('Failed to get weather');
          }
        });
    });
  }

  function resetWeatherQuery(){
    if (xhrWeather){
      xhrWeather.abort();
      xhrWeather = undefined;
    }
  }
  
  function displayWeather(data){
    $("#location").text(data.name);
    $("#temp-celsius").text(data.main.temp + "");
    showTemperature();
    $("#weather").text(data.weather[0].description);
    if (data.weather[0].icon){
      $("#icon").html('<img src="' + data.weather[0].icon + '" alt="' + data.weather[0].main + '">');
    } else {
      $("#icon").html('');
    }
    displayTimestamp();

    resetAutocomplete();
    $("#messagebox").hide();
    $("#message").html("");
  }

  // copied as is from MDN
  function toLocaleStringSupportsLocales() {
    try {
      new Date().toLocaleString('i');
    } catch (e) {
      return e instanceof RangeError;
    }
    return false;
  }

  function displayTimestamp(){
    let date = new Date(actionDate);
    let dateOptions = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    };
    let timeOptions = {
      hour: 'numeric',
      minute: 'numeric',
    };

    if (localesSupport){
      $("#timestamp").html(`<span class="date avoidbreak">${date.toLocaleString('en', dateOptions)}</span>` +
        ` <span class="time avoidbreak">${date.toLocaleString('en', timeOptions)}</span>`);
    } else {
      $("#timestamp").html(date.toLocaleString());
    }

  }
  
  function displayErrorMessage(msg){
    $("#message").html(`<div class="error">${msg}</div>`);
    $("#messagebox").show();
  }

  function displayInfoMessage(msg){
    $("#message").html(`<div class="info text-left">${msg}</div><div><div class="loader"></div></div>`);
    $("#messagebox").show();
  }

  function handleError(errorMsg){
    if (errorMsg !== 'ignore'){
      displayErrorMessage(errorMsg);
    }
  }

  // getLocationCoordinates
  // get the name and the coordinates of the place selected by user in the autocomplete
  function getLocationCoordinates(e, timestamp){
    return new Promise((resolve, reject) => {
      displayInfoMessage('Getting coordinates...');

      resolve({ 
        latitude: e.suggestion.latlng.lat, 
        longitude: e.suggestion.latlng.lng, 
        name: e.suggestion.name, 
        timestamp: timestamp,
      });
    });
  }

  // getWeatherAtLocation
  // user-triggered action bound to selection of an item in the autocomplete
  function getWeatherAtLocation(e){
    // get location coordinates (sync)
    getLocationCoordinates(e, startNewAction())
      // get weather (async)
      .then(getWeather)
      // display weather (sync)
      .then(displayWeather)
      .catch(handleError);
  }

  // getLocalWeather
  // user-triggered action bound to the 'My Location' button
  function getLocalWeather(){
    // get geolocation (async)
    getLocation(startNewAction())
      // get weather (async)
      .then(getWeather)
      // display weather (sync)
      .then(displayWeather)
      .catch(handleError);
  }

  // startNewAction
  // timestamps the new action and cancels any pending async queries
  function startNewAction(){
    actionDate = Date.now();
    resetLocationWatch();
    resetWeatherQuery();
    return actionDate;
  }

  function initAutocomplete(){
    // restricted key
    const apiOptions = {
      appId: 'plN7GLAZ3P5K',
      apiKey: '77917a155888fc9ec6189d2ab6cc84bc',
    };

    let input = document.getElementById('search-location');
    let options = {
      container: input,
    };

    // development access to Algoglia Places is done without authentication
    // production uses the restricted key
    if (location.hostname !== ''){
      options = Object.assign(apiOptions, options);
    }

    autocomplete = places(options);

    autocomplete.on('change', getWeatherAtLocation);
    autocomplete.on('error', e => handleError(`Autocomplete error: ${e.message}`));
    autocomplete.on('limit', e => handleError(`Autocomplete free tier limit reached: Please try again later`));
  }

  function resetAutocomplete(){
    autocomplete.setVal('');
  }

  // the temperature we get from the weather API is stored in a hidden div
  // with all its digits. Functions showCelcius and ShowFahrenheit convert
  // from this raw value instead of from each other in order to avoid rounding errors.
  function getTemperature(){
    return parseFloat($("#temp-celsius").text());
  }

  // output the temperature in celsius
  function showCelsius(){
    setTimeout(function(){
      $("#temp").text(Math.round(getTemperature()) + '°C');      
    }, 0);
  }

  // output the temperature in farhrenheit
  function showFahrenheit(){
    setTimeout(function(){
      let fahrenheit = getTemperature() * 9 / 5 + 32;
      $("#temp").text(Math.round(fahrenheit) + '°F');
    }, 0);
  }

  // output the temperature in the correct unit according to which button is currently selected
  function showTemperature(){
    setTimeout(function(){

      if (document.getElementById('celsius').checked){
        showCelsius();

      } else if (document.getElementById('fahrenheit').checked){
        showFahrenheit();
      }
    }, 0);
  }

  $(document).ready(function(){
    $("#current-location").click(getLocalWeather);
    $("#celsius").change(showCelsius);
    $("#fahrenheit").change(showFahrenheit);
    
    // create autocomplete
    initAutocomplete();

    // initialise with some default location
    const startLocation = {latitude: 51.507351, longitude: -0.127758, name: "London", timestamp: startNewAction()};
    getWeather(startLocation)
      .then(displayWeather)
      .catch(handleError);
  });
})();