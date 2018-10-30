const { tmpdir } = require('os')
const {
  join,
  basename,
  sep,
  isAbsolute,
} = require('path')
const childProcess = require('child_process')
const fs = require('fs')

const { randomString } = require('./target/handler')

const defaultSourcePath = join(__dirname, 'target')
const defaultRoot = join(tmpdir(), 'slsart-integration')

const flatten = values =>
  values.reduce((flattened, value) =>
    (Array.isArray(value)
      ? flattened.concat(flatten(value))
      : flattened.concat([value])), [])

const joinFirstTwo = parts =>
  [join(parts[0] || sep, parts[1]), ...parts.slice(2)]

const splitPath = path =>
  (isAbsolute(path)
    ? joinFirstTwo(path.split(sep))
    : path.split(sep))

const joinToLast = (list, value) =>
  (list.length
    ? join(list[list.length - 1], value)
    : value)

const progressivePaths = path =>
  splitPath(path).reduce(
    (list, part) => [...list, joinToLast(list, part)],
    []
  )

const namesToFullPaths = directory =>
  names =>
    names.map(name => join(directory, name))

const filterOutSpecFiles = names =>
  names.filter(name => !name.endsWith('.spec.js'))

const sourceFileNameTo = destination =>
  sourceFileName =>
    join(destination, basename(sourceFileName))

const execError = (err, stderr) =>
  new Error(`${err.message} ${stderr}`)

const pure = {
  mkdir: (mkdir = fs.mkdir) =>
    directory =>
      new Promise(resolve => mkdir(directory, resolve)),

  mkdirp: (mkdir = pure.mkdir) =>
    directory => progressivePaths(directory)
      .reduce(
        (awaiting, nextPath) => awaiting.then(() => mkdir(nextPath)),
        Promise.resolve()
      ),

  ls: (readdir = fs.readdir) =>
    directory =>
      new Promise(resolve =>
        readdir(directory, (ignoredError, names) =>
          resolve(names || []))),

  cp: (copyFile = fs.copyFile) =>
    destination =>
      source =>
        new Promise(resolve => copyFile(source, destination, resolve)),

  findTargetSourceFiles: (ls = pure.ls(), sourcePath = defaultSourcePath) =>
    () =>
      ls(sourcePath)
        .then(filterOutSpecFiles)
        .then(namesToFullPaths(sourcePath)),

  copyTofolder: (cp = pure.cp()) =>
    (destination) => {
      const toDestination = sourceFileNameTo(destination)
      return filePath =>
        cp(toDestination(filePath))(filePath)
    },

  copyAll: (copyTofolder = pure.copyTofolder()) =>
    destination =>
      sourceFiles =>
        Promise.all(sourceFiles.map(copyTofolder(destination))),

  writeFile: (writeFile = fs.writeFile) =>
    (destination, data) =>
      new Promise((resolve, reject) =>
        writeFile(destination, data, err =>
          (err
            ? reject(err)
            : resolve()))),

  writeConfig: (writeFile = pure.writeFile()) =>
    (destination, instanceId) =>
      writeFile(join(destination, 'config.yml'), `instanceId: ${instanceId}`),

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
    mkdirp = pure.mkdirp(),
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

  listAbsolutePathsRecursively: (ls = pure.ls()) => {
    const listNext = directory =>
      ls(directory)
        .then(files => files.map(file => join(directory, file)))
        .then(files => Promise.all(files.map(listNext)))
        .then(children => [...flatten(children), directory])
    return listNext
  },

  rm: (unlink = fs.unlink) =>
    path =>
      new Promise(resolve =>
        unlink(path, resolve)),

  rmdir: (rmdir = fs.rmdir) =>
    path =>
      new Promise(resolve =>
        rmdir(path, resolve)),

  rmAny: (rm = pure.rm(), rmdir = pure.rmdir()) =>
    path =>
      rm(path).then(err => (err ? rmdir(path) : undefined)),

  rmrf: (
    listAll = pure.listAbsolutePathsRecursively(),
    rm = pure.rmAny()
  ) =>
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
        .catch(() => warn('failed to sls remove', directory))
        .then(() => log('deleting', directory) || rmrf(directory))
        .then(() => log('done')),

  listTempDeployments: (ls = pure.ls()) =>
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
