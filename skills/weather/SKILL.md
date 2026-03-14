---
name: weather
description: Check weather or forecast for any location. Use when the user asks about weather, temperature, rain, or forecast.
---

# Weather Skill

Uses Open-Meteo API (no API key needed).

## Usage

```bash
curl -s "https://api.open-meteo.com/v1/forecast?latitude=LAT&longitude=LON&daily=weathercode,temperature_2m_max,temperature_2m_min,precipitation_sum,windspeed_10m_max&timezone=auto&forecast_days=3"
```

## Home location
Volketswil, Switzerland — lat: 47.3833, lon: 8.7167

## Weather codes → emoji
0=☀️ 1=🌤️ 2=⛅ 3=☁️ 45/48=🌫️ 51-55=🌦️ 61-65=🌧️ 71-75=🌨️ 80-82=🌦️ 95=⛈️

## Output format
3 short lines — Today / Tomorrow / [weekday]. Natural language with emojis.
Include wind only if >25 km/h. Include precipitation if >1mm.
