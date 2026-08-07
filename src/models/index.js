/**
 * Model loader. Every file in this directory (except this one) exports a
 * `(sequelize, DataTypes) => Model` factory and an optional
 * `Model.associate(models)` hook. This file:
 *   1. requires every model file and initializes it,
 *   2. runs every model's `associate()` once all models exist (associations
 *      routinely reference each other both ways, so they can't run during
 *      step 1 without careful ordering — doing it as a separate pass avoids
 *      that entirely),
 *   3. exports one `db` object — `{ sequelize, Sequelize, User, Booking, ... }`
 *      — that the rest of the app imports from, instead of requiring
 *      individual model files directly.
 *
 * Adding a new model is just: drop a new file in this directory. Nothing
 * here needs to change.
 */
const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const basename = path.basename(__filename);
const db = {};

fs.readdirSync(__dirname)
  .filter((file) => file !== basename && file.endsWith('.js'))
  .forEach((file) => {
    // Dynamic by design — this loop is what lets a new model file be
    // picked up just by existing in this directory, see the file comment.
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const modelFactory = require(path.join(__dirname, file));
    const model = modelFactory(sequelize, DataTypes);
    db[model.name] = model;
  });

Object.values(db).forEach((model) => {
  if (typeof model.associate === 'function') {
    model.associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;
