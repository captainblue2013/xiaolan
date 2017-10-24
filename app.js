/**
 * Created by lanhao on 15/5/17.
 */
"use strict";

const http = require('http');
const fs = require('fs');
const Events = require('events');
const serveStatic = require('serve-static');
const async = require('async');

const Route = require('./lib/route');
const Request = require('./lib/request');
const Response = require('./lib/response');
const Session = require('./lib/session');
const E = require('./lib/error');

if (fs.existsSync(process.cwd() + '/definitions/errors/Error.gen.js')) {
  let errDefine = require(process.cwd() + '/definitions/errors/Error.gen.js');
  for (let k in errDefine) {
    E.RegisterError(errDefine[k]);
  }
  global.error = E.ErrorShop;
  global.error.INTERNAL_ERROR = new E.XiaolanError({
    code: -1,
    httpStatus: 500,
    message: 'Internal Error',
    name: 'INTERNAL_ERROR',
  });
} else {
  global.error = {
    INTERNAL_ERROR: new E.XiaolanError({
      code: -1,
      httpStatus: 500,
      message: 'Internal Error',
      name: 'INTERNAL_ERROR',
    })
  }
};

global.aha = (t) => {
  let date = new Date();
  console.log('Time used:', date.getTime() - t);
};

global.error.BAD_REQUEST = new E.XiaolanError({
  name: 'BAD_REQUEST',
  httpStatus: 400,
  code: -2,
  message: '入参检测错误',
});

global.error.NOT_FOUND = new E.XiaolanError({
  name: 'NOT_FOUND',
  httpStatus: 404,
  code: -3,
  message: 'not found',
});

class Xiaolan {
  constructor(config) {
    this.basePath = process.cwd();
    this.config = config;
    this.sessionStorage = new Session(config, this);
    this.route = this.register();
    this.event = new Events();
    process.app = this;
  }

  register() {
    let map = {};
    if (fs.existsSync(process.cwd() + '/routes.js')) {
      map = require(process.cwd() + '/routes');
    }

    Route.register(map);
    return Route.routingTable;
  }

  createServer() {
    let app = this;

    http.createServer((req, res) => {
      let _date = new Date();

      console.log(' ');
      console.log(_date.toLocaleString());
      console.log(req.method, req.url);

      if (this.config.cors === true) {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type,Content-Length, Authorization, Accept,X-Requested-With");
        res.setHeader("Access-Control-Allow-Methods", "PUT,POST,GET,DELETE,OPTIONS");
      }

      req.body = '';
      req.on('data', (chunk) => {
        req.body += chunk;
      });
      req.on('end', () => {
        let response = new Response(res, app);
        response.requestTime = _date.getTime();
        let request = new Request(req, app);
        app.sessionStorage.start(request, response);
        app.handler(request, response);
      });


    }).listen(this.config.port || 3001);

    console.log('listen on port:' + (this.config.port || 3001));
    console.log('.');
    console.log('.   <------ nobody care about this point!!');
  }

  handler(req, res) {
    if (Object.keys(this.route).length > 0) {
      let method = req.method.toLocaleLowerCase();
      let uri = req.pathInfo;
      let matched = false;
      if (this.route[method]) {
        for (var k in this.route[method]) {
          if (this.route[method][k].reg.test(uri)) {
            matched = true;
            break;
          }
        }
        if (matched) {
          req.pickParams(this.route[method][k].patten);

          let reactor = this.route[method][k].reactor;
          let funcSeries = [];
          funcSeries = funcSeries.concat(this.route[method][k].middleware);

          let rSet = [];
          let eSet = []
          async.eachSeries(funcSeries, (item, callback) => {
            item.reflect(req, res).execute()
              .then((r) => {
                rSet.push(r);
                callback(null, r);
              })
              .catch((e) => {
                eSet.push(e);
                callback(e, null);
              });
          }, function (err, ret) {
            if (err) {
              res.raw(error.INTERNAL_ERROR.httpStatus, {
                'content-type': 'application/json; charset=UTF-8'
              }, error.INTERNAL_ERROR.obj());
            } else {
              if (eSet.length) {
                console.error(eSet);
                res.raw(error.INTERNAL_ERROR.httpStatus, {
                  'content-type': 'application/json; charset=UTF-8'
                }, error.INTERNAL_ERROR.obj());
              } else {
                if (rSet.length) {
                  for (let k in rSet) {
                    if (rSet[k] instanceof E.XiaolanError) {
                      res.raw(rSet[k].httpStatus, {
                        'content-type': 'application/json; charset=UTF-8'
                      }, rSet[k].obj());
                    } else {
                      reactor.reflect(req, res).execute()
                        .then((v) => {
                          if (v instanceof E.XiaolanError) {
                            res.raw(v.httpStatus, {
                              'content-type': 'application/json; charset=UTF-8'
                            }, v.obj());
                          } else {
                            res.json(200, v);
                          }
                        })
                        .catch((e) => {
                          console.error(e);
                          res.raw(error.INTERNAL_ERROR.httpStatus, {
                            'content-type': 'application/json; charset=UTF-8'
                          }, error.INTERNAL_ERROR.obj());
                        });
                    }
                  }
                } else {
                  reactor.reflect(req, res).execute()
                    .then((v) => {
                      if (v instanceof E.XiaolanError) {
                        res.raw(v.httpStatus, {
                          'content-type': 'application/json; charset=UTF-8'
                        }, v.obj());
                      } else {
                        res.json(200, v);
                      }
                    })
                    .catch((e) => {
                      console.error(e);
                      let message = e.name === 'MysqlError' ? e.sqlMessage : '';
                      res.raw(error.INTERNAL_ERROR.httpStatus, {
                        'content-type': 'application/json; charset=UTF-8'
                      }, Object.assign(error.INTERNAL_ERROR.obj(), {message}));
                    });
                }
              }
            }
          });
        } else {
          res.raw(error.NOT_FOUND.httpStatus, {
            'content-type': 'application/json; charset=UTF-8'
          }, error.NOT_FOUND.obj());
        }
      } else {
        res.raw(error.NOT_FOUND.httpStatus, {
          'content-type': 'application/json; charset=UTF-8'
        }, error.NOT_FOUND.obj());
      }
    } else {

      try {
        require(this.basePath + '/controllers/' + req.params[0])[req.params[1]](req, res);
      } catch (ex) {
        console.log(ex);
        res.raw(error.NOT_FOUND.httpStatus, {
          'content-type': 'application/json; charset=UTF-8'
        }, error.NOT_FOUND.obj());
      }
    }
  }
}


module.exports = Xiaolan;
