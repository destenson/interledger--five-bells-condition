'use strict'

const _ = require('lodash')
const http = require('http')
const superagent = require('co-supertest')
const log = require('../../src/common').log

const loadConfig = require('../../src/lib/config')
const InfoCache = require('../../src/lib/info-cache')
const RoutingTables = require('../../src/lib/routing-tables')
const RouteBuilder = require('../../src/lib/route-builder')
const RouteBroadcaster = require('../../src/lib/route-broadcaster')
const makeCore = require('../../src/lib/core')
const BalanceCache = require('../../src/lib/balance-cache')

const createApp = require('ilp-connector').createApp

exports.create = function (context) {
  const config = loadConfig()
  const Backend = require('../../src/backends/' + config.get('backend'))
  const backend = new Backend({
    currencyWithLedgerPairs: config.get('tradingPairs'),
    backendUri: config.get('backendUri'),
    spread: config.get('fxSpread')
  })
  const routingTables = new RoutingTables({
    baseUri: config.server.base_uri,
    backend: config.backend,
    expiryDuration: config.routeExpiry,
    slippage: config.slippage,
    fxSpread: config.fxSpread
  })
  const core = makeCore({config, log, routingTables})
  const infoCache = new InfoCache(core)
  const routeBuilder = new RouteBuilder(
    routingTables,
    infoCache,
    core,
    {
      minMessageWindow: config.expiry.minMessageWindow,
      slippage: config.slippage
    }
  )
  const routeBroadcaster = new RouteBroadcaster(routingTables, backend, core, infoCache, {
    tradingPairs: config.tradingPairs,
    minMessageWindow: config.expiry.minMessageWindow,
    routeCleanupInterval: config.routeCleanupInterval,
    routeBroadcastInterval: config.routeBroadcastInterval,
    autoloadPeers: true,
    peers: []
  })
  const balanceCache = new BalanceCache(core)
  const app = createApp(config, core, backend, routeBuilder, routeBroadcaster, routingTables, infoCache, balanceCache)
  context.app = app
  context.backend = backend
  context.routingTables = routingTables
  context.routeBroadcaster = routeBroadcaster
  context.routeBuilder = routeBuilder
  context.core = core
  context.config = config
  context.infoCache = infoCache
  context.balanceCache = balanceCache

  context.server = http.createServer(app.callback()).listen()
  context.port = context.server.address().port
  context.request = function () {
    return superagent(context.server)
  }
  context.formatId = function (sourceObj, baseUri) {
    let obj = _.cloneDeep(sourceObj)
    obj.id = 'http://localhost' + baseUri + sourceObj.id
    return obj
  }
}
