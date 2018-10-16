const { tmpdir } = require('os')
const { join, basename } = require('path')
const childProcess = require('child_process')
const fs = require('fs')

const { randomString } = require('./target/handler')
const { pipe, tap } = require('./target/fn')

const defaultSourcePath = join(__dirname, 'target')
const defaultRoot = join(tmpdir(), 'slsart-integration')
const defaultSeparator = '-'.repeat(process.stdout.columns)

const flatten = values =>
  values.reduce((flattened, value) =>
    (Array.isArray(value)
      ? flattened.concat(flatten(value))
      : flattened.concat([value])), [])

const pure = {
  mkdirp: (mkdir = fs.mkdir) =>
    directory =>
      new Promise(resolve =>
        mkdir(directory, { recursive: true }, resolve)),

  ls: (readdir = fs.readdir) =>
    directory =>
      new Promise(resolve =>
        readdir(directory, (ignoredError, names) =>
          resolve(names || []))),

  cp: (copyFile = fs.copyFile) =>
    destination =>
      source =>
        new Promise(resolve =>
          copyFile(source, destination, resolve)),

  namesToFullPaths: directory =>
    names =>
      names.map(name => join(directory, name)),

  filterNames: names =>
    names.filter(name => !name.endsWith('.spec.js')),

  findTargetSourceFiles: (ls = pure.ls(), sourcePath = defaultSourcePath) =>
    () =>
      ls(sourcePath)
        .then(pure.filterNames)
        .then(pure.namesToFullPaths(sourcePath)),

  sourceFileNameTo: destination =>
    sourceFileName =>
      join(destination, basename(sourceFileName)),

  copyAll: (cp = pure.cp()) =>
    destination =>
      sourceFiles =>
        Promise.all(sourceFiles
          .map(pure.sourceFileNameTo(destination))
          .map(cp(destination))
        ),

  writeFile: (writeFile = fs.writeFile) =>
    (destination, data) =>
      new Promise((resolve, reject) =>
        writeFile(destination, data, err =>
          (err
            ? reject(err)
            : resolve()))),

  writeConfig: (writeFile = pure.writeFile()) =>
    (destination, instanceId) =>
      writeFile(destination, `instanceId: ${instanceId}`),

  stageTarget: (
    findTargetSourceFiles = pure.findTargetSourceFiles(),
    copyAll = pure.copyAll(),
    writeConfig = pure.writeConfig()
  ) =>
    (destination, instanceId) =>
      findTargetSourceFiles()
        .then(copyAll(destination))
        .then(writeConfig(destination, instanceId)),

  execAsync: (exec = childProcess.exec) =>
    (command, options = {}) =>
      new Promise((resolve, reject) =>
        exec(command, options, (err, stdout, stderr) =>
          (err
            ? reject(new Error(`${err.message} ${stderr}`))
            : resolve(stdout)))),

  deploy: (exec = pure.execAsync) =>
    directory =>
      exec('sls deploy', { cwd: directory }),

  tempLocation: (instanceId = randomString(8), root = defaultRoot) =>
    ({ instanceId, destination: join(root, instanceId) }),

  deployNewTarget: (
    { instanceId, destination } = pure.tempLocation(),
    mkdirp = pure.mkdirp(),
    stageTarget = pure.stageTarget(),
    deploy = pure.deploy(),
    log = console.log,
    warn = console.error
  ) =>
    () =>
      mkdirp(destination)
        .then(() => log('staging target', instanceId, 'to', destination))
        .then(() => stageTarget(destination, instanceId))
        .then(() => log('deploying', destination))
        .then(() => deploy(destination))
        .catch(err => warn('failed to deploy a new target:', err.stack)),

  remove: (exec = pure.execAsync) =>
    directory =>
      exec('sls remove', { cwd: directory }),

  listAbsolutePathsRecursively: (ls = pure.ls()) => {
    const listNext = directory =>
      ls(directory)
        .then(files => files.map(file => join(directory, file)))
        .then(files => ({ files, children: Promise.all(files.map(listNext)) }))
        .then(({ files, children }) =>
          [...flatten(children), ...files, directory])
    return listNext
  },

  rmrf: (listAll = pure.listAbsolutePathsRecursively(), rm = pure.rm()) =>
    directory =>
      listAll(directory)
        .then(files => [...files, directory])
        .then(files => Promise.all(files.map(rm))),

  removeTempDeployment: (
    log = console.log,
    remove = pure.remove(),
    warn = console.error,
    rmrf = pure.rmrf()
  ) =>
    directory =>
      log('removing temp deployment', directory) || remove(directory)
        .catch(err => warn('failed to sls remove', directory, ':', err.stack))
        .then(() => rmrf(directory)),

  listTempDeployments: (ls = pure.ls(), root = defaultRoot) =>
    () =>
      ls(root)
        .then(directories =>
          directories.map(directory => join(root, directory))),

  cleanupDeployments: (
    list = pure.listTempDeployments(),
    remove = pure.removeTempDeployment(),
    log = console.log
  ) =>
    () =>
      log('cleaning up deployments in', root) || list()
        .then(directories => directories.reduce(
          (awaiting, directory) => awaiting.then(() => remove(directory)),
          Promise.resolve()
        )),
}

module.exports = {
  pure,
  deployNewTarget: pure.deployNewTarget(),
  removeTempDeployment: pure.removeTempDeployment(),
  cleanupDeployments: pure.cleanupDeployments(),
}
