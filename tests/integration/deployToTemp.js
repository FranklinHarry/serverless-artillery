const { tmpdir } = require('os')
const { join } = require('path')
const childProcess = require('child_process')

const { randomString } = require('./target/handler')
const fs = require('./fs')

const defaultSourcePath = join(__dirname, 'target')
const defaultRoot = join(tmpdir(), 'slsart-integration')

const execError = (err, stderr) =>
  new Error(`${err.message} ${stderr}`)

const namesToFullPaths = directory =>
  names =>
    names.map(name => join(directory, name))

const filterOutSpecFiles = names =>
  names.filter(name => !name.endsWith('.spec.js'))

const pure = {
  findTargetSourceFiles: (ls = fs.ls, sourcePath = defaultSourcePath) =>
    () =>
      ls(sourcePath)
        .then(filterOutSpecFiles)
        .then(namesToFullPaths(sourcePath)),

  writeConfig: (writeFile = fs.writeFile) =>
    (destination, instanceId) =>
      writeFile(join(destination, 'config.yml'), `instanceId: ${instanceId}`),

  stageTarget: (
    findTargetSourceFiles = pure.findTargetSourceFiles(),
    copyAll = fs.copyAll,
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
            ? reject(execError(err, stderr))
            : resolve(stdout)))),

  deploy: (exec = pure.execAsync()) =>
    directory =>
      exec('sls deploy', { cwd: directory }),

  tempLocation: (random = () => randomString(8), root = defaultRoot) =>
    (instanceId = random()) =>
      ({ instanceId, destination: join(root, instanceId) }),

  deployNewTarget: (
    tempLocation = pure.tempLocation(),
    mkdirp = fs.mkdirp,
    stageTarget = pure.stageTarget(),
    deploy = pure.deploy(),
    log = console.log,
    warn = console.error
  ) =>
    ({ instanceId, destination } = tempLocation()) =>
      mkdirp(destination)
        .then(() => log('staging target', instanceId, 'to', destination))
        .then(() => stageTarget(destination, instanceId))
        .then(() => log('deploying', destination))
        .then(() => deploy(destination))
        .then(log)
        .then(() => true)
        .catch(err =>
          warn('failed to deploy a new target:', err.stack) || false),

  remove: (exec = pure.execAsync()) =>
    directory =>
      exec('sls remove', { cwd: directory }),

  removeTempDeployment: (
    log = console.log,
    remove = pure.remove(),
    warn = console.error,
    rmrf = fs.rmrf
  ) =>
    directory =>
      log('removing temp deployment', directory) || remove(directory)
        .catch(() => warn('failed to sls remove', directory))
        .then(() => log('deleting', directory) || rmrf(directory))
        .then(() => log('done')),

  listTempDeployments: (ls = fs.ls) =>
    root =>
      ls(root)
        .then(directories =>
          directories.map(directory => join(root, directory))),

  cleanupDeployments: (
    list = pure.listTempDeployments(),
    remove = pure.removeTempDeployment(),
    log = console.log,
    root = defaultRoot
  ) =>
    () =>
      log('cleaning up deployments in', root) || list(root)
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
