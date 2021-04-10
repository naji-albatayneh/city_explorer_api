'use strict';

const express = require('express');
const app = express();

const cors = require('cors');
app.use(cors());

const pg = require('pg');
const superagent = require('superagent');

require('dotenv').config();
const PORT = process.env.PORT || 3000;

const DATABASE_URL = process.env.DATABASE_URL;
const client = new pg.Client(DATABASE_URL);
client.on('error', err => {
  console.log('Database is not found!');
});

//////////////// APIs Keys ////////////////
const locationKey = process.env.GEOCODE_API_KEY;
const weatherKey = process.env.WEATHER_API_KEY;
const parksKey = process.env.PARKS_API_KEY;
const moviesKey = process.env.MOVIE_API_KEY;
const yelpKey = process.env.YELP_API_KEY;


//////////////// Route Handlers ////////////////
app.get('/location', handleLocationRequest);
app.get('/weather', handleWeatherRequest);
app.get('/parks', handleParksRequest);
app.get('/movies', handleMoviesRequest);
app.get('/yelp', handleYelpRequest);
app.get('/', handleHomePage);
app.use('*', handleRouteErrors);

let city;
//////////////// Location ////////////////
function handleLocationRequest(req, res) {
  city = req.query.city;
  const values = [city];

  const SQL = 'SELECT * FROM location WHERE search_query = $1';
  const url = `https://us1.locationiq.com/v1/search.php?key=${locationKey}&q=${city}&format=json&limit=1`;

  client.query(SQL, values)
    .then((data) => {
      if (data.rows.length > 0) {
        res.status(200).json(data.rows[0]);
      } else {
        superagent.get(url)
          .then(data => {
            const locationData = data.body[0];
            const locationInfo = new Place(city, locationData);
            const savedValues = [locationInfo.search_query, locationInfo.formatted_query, locationInfo.latitude, locationInfo.longitude];
            const SQL = 'INSERT INTO location(search_query,formatted_query,latitude,longitude) VALUES ($1,$2,$3,$4) RETURNING *';
            client.query(SQL, savedValues).then((data) => {
              res.status(200).json(data.rows[0]);
            });
          });
      }
    })
    .catch((err) => anyErrorHandler(err, req, res));
}

function Place(city, locationData) {
  this.search_query = city;
  this.formatted_query = locationData.display_name;
  this.latitude = locationData.lat;
  this.longitude = locationData.lon;
}


//////////////// Weather ////////////////
function handleWeatherRequest(req, res) {
  city = req.query.search_query;
  const url = `https://api.weatherbit.io/v2.0/forecast/daily?city=${city}&key=${weatherKey}`;
  superagent.get(url)
    .then(weatherData => {
      const dailyWeatherInfo = weatherData.body.data.map(day => {
        return new Weather(day);
      });
      res.status(200).json(dailyWeatherInfo);
    })
    .catch((err) => anyErrorHandler(err, req, res));
}

function Weather(dailyWeather) {
  this.forecast = dailyWeather.weather.description;
  this.date = dailyWeather.valid_date;
}

//////////////// Parks ////////////////
function handleParksRequest(req, res) {
  city = req.query.search_query;
  const url = `https://developer.nps.gov/api/v1/parks?q=${city}&api_key=${parksKey}`;
  superagent.get(url)
    .then(parks => {
      const parkInfo = parks.body.data.map(park => {
        return new Park(park.fullName, park.addresses[0].line1 + park.addresses[0].city, park.description, park.entranceFees[0].cost, park.url);
      });
      res.status(200).send(parkInfo);
    })
    .catch(err => anyErrorHandler(err, req, res));


}

function Park(name, address, description, fees, url) {
  this.name = name;
  this.address = address;
  this.description = description;
  this.fee = fees;
  this.url = url;
}

//////////////// Movies ////////////////
function handleMoviesRequest(req, res) {
  city = req.query.search_query;
  const url = `https://api.themoviedb.org/3/search/movie?api_key=${moviesKey}&query=${city}`;
  superagent.get(url)
    .then(movies => {
      const movieArr = movies.body.results.map(movieData => {
        return new Movie(movieData);
      });
      res.status(200).send(movieArr);
    })
    .catch(err => anyErrorHandler(err, req, res));
}

function Movie(movieData) {
  this.title = movieData.title;
  this.overview = movieData.overview;
  this.votes = movieData.vote_count;
  this.avgVotes = movieData.vote_average;
  this.releaseDate = movieData.release_date;
  this.popularity = movieData.popularity;
  this.imageURL = `https://image.tmdb.org/t/p/w500${movieData.poster_path}`;
}


//////////////// Yelp ////////////////
function handleYelpRequest(req, res) {
  city = req.query.city;
  const url = `https://api.yelp.com/v3/businesses/search?location=${city}`;
  superagent.get(url)
    .set('Authorization', `Bearer ${yelpKey}`)
    .then(yelp => {
      const yelpArr = yelp.body.businesses.map(yelpData => {
        return new Yelp(yelpData);
      });
      res.status(200).send(yelpArr);
    })
    .catch((err) => anyErrorHandler(err, req, res));
}

function Yelp(yelpData) {
  this.name = yelpData.name;
  this.price = yelpData.price;
  this.rating = yelpData.rating;
  this.imgURL = yelpData.image_url;
  this.url = yelpData.url;
}


//////////////// handleHomePage ////////////////
function handleHomePage(req, res) {
  res.status(200).send('<p> Available Routes: /location <br> /weather <br> /parks <br> /movies <br> /yelp </p>');
}


//////////////// Errors ////////////////
function anyErrorHandler(error, req, res) {
  res.status(500).send(error);
}

function handleRouteErrors(req, res) {
  res.status(404).send('Route Error - Page is not found!');
}

//////////////// Proof of Life ////////////////
client.connect().then(() => {
  app.listen(PORT, () => console.log(`Server is alive and listening on port: ${PORT}`));
});
