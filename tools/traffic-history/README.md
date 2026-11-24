# Barcelona traffic history

The home landmark is the street outside Via Júlia metro station in Nou Barris. The main workplace is the public entrance to DFactory Barcelona on Carrer Número 27 in the Zona Franca industrial estate. The design uses public road points and records no rider locations. [Via Júlia station](https://www.tmb.cat/en/barcelona/metro?_metrolineportlet_cmd=METRO_ESTACIO&_metrolineportlet_groupId=20182&_metrolineportlet_metroLine=L4&_metrolineportlet_renderPage=view-metro-stop-line&_metrolineportlet_stationName=433) · [City workplace directory and entrance map](https://guia.barcelona.cat/es/detall/dfactory-barcelona_99400729953.html)

Barcelona counted more than 273,000 motorcycles and mopeds in 2023. TomTom reported 41.1% citywide congestion for 2025. Those city figures guided the location choice. Each corridor gets its own direction-specific travel-time history. [City mobility report](https://bcnroc.ajuntament.barcelona.cat/jspui/bitstream/11703/140067/1/20241121_LLIBRE_IMa__14-03.pdf) · [TomTom traffic index](https://www.tomtom.com/traffic-index/city/barcelona/)

| Corridor | Required waypoint | Home to main office | Main office to home |
| --- | --- | ---: | ---: |
| A | Passeig de Colom | 22.1 km | 19.6 km |
| B | Plaça d'Espanya | 21.2 km | 21.2 km |

Distances are from a one-time OpenStreetMap car-network connectivity check on 2026-11-24. The motorcycle collector requests a traffic-aware route through the same waypoint on every observation. A provider can vary the streets within that corridor. The Lens draws the existing schematic. [OpenStreetMap routing service](https://routing.openstreetmap.de/) · [TomTom Calculate Route API](https://docs.tomtom.com/routing-api/documentation/tomtom-maps/v1/calculate-route)

## Collect and publish

Use Node 22.13 or later. Set `TOMTOM_API_KEY` in the collector process environment on the machine that will run it. From the project root, start the collector with the following command.

```sh
node tools/traffic-history/collector.mjs --watch --publish
```

The command collects immediately and at each 15-minute boundary while the process is running. Lens Studio can be closed. Each slot normally uses four TomTom routing requests across two corridors and two directions, or 384 requests per full day. Stop with Ctrl+C. Restarting within the same slot skips complete comparisons and retries incomplete directions. Leave off `--watch` for a single collection, including when using an existing scheduler.

Observations are written to `.traffic-history/observations.sqlite`. With `--publish`, a successful tick atomically replaces `Assets/TrafficHistory.json` with a seven-day profile. Restart Preview after the asset imports to load it. To collect without changing the Lens asset, leave off `--publish`. To export existing observations without contacting TomTom, run `node tools/traffic-history/collector.mjs --export-only`.

The committed asset selects the synthetic Tuesday scenarios. To use those scenarios again after a local export, set the contents of `Assets/TrafficHistory.json` to `{"version":1,"source":"sample"}` and restart Preview. The SQLite observations can be used for the next export.

## Connect the live profile to the Lens

Keep the TomTom key on the collector machine. Export its public, aggregate traffic profile to a path served over HTTPS. Give the profile URL a cache lifetime under one minute.

```sh
node tools/traffic-history/collector.mjs --watch --publish --output=/path/to/public/traffic-profile.json
```

In Lens Studio, add an Internet Module asset and assign it to **Internet Module** on the TrafficInsightMain component. Set **Traffic Profile Url** to the exported HTTPS endpoint. Use the Spectacles device type in Preview. A configured Lens checks the profile while the main-office planning map is open and refreshes it up to once a minute. The hosted endpoint has not been exercised with a live TomTom key in this project. If the service stops responding, the last valid profile remains usable until its estimates expire. [Snap Internet Access requirements](https://developers.snap.com/spectacles/about-spectacles-features/apis/internet-access)

## How the advice is calculated

Each pair contains TomTom's estimated motorcycle travel times at collection time. Group observations by direction, Barcelona weekday and 15-minute local time across the last 12 weeks. Take the median across distinct local dates, giving each date one vote even when clocks repeat an hour. At least three dates must support both routes in a slot.

The **Now** card uses the most recent complete A/B sample in that direction for up to 20 minutes. When the sample expires, the Lens labels the fallback as typical traffic. Each weekday graph plots both routes using that day's historical 15-minute slots. Gaps show where fewer than three matching dates were collected. The planning card compares the quickest ride now with supported departures within the next hour on the same local day. A saving of at least five minutes of riding produces a busy-period suggestion. A good-time suggestion requires coverage of all four later slots. Each arrival clock includes the wait until departure. Missing or expired history gives no time-to-leave recommendation. The map still accepts either route.

Run the collector regression checks with `node --test tools/traffic-history/collector.test.mjs`. These use temporary in-memory databases. Live collection requires a TomTom API key. LEAF C15 passed in Interactive Preview on 2026-11-24. [Departure card and screenshots](../../README.md#traffic-insight-departure-planning)
