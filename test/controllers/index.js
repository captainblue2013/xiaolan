/**
 * Created by lanhao on 15/5/17.
 */



var Controller = {};

Controller.index = function (req, res) {
  req.session['count'] = req.session['count']+1 || 1;
  res.json(200, req.session);
};

Controller.detail = function (req, res) {
  res.end('detail');
}

module.exports = Controller;