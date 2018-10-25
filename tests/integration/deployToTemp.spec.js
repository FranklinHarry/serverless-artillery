const { assert: { strictEqual, deepStrictEqual, fail } } = require('chai')
const { sep } = require('path')

const {
  pure: {
    mkdirp,
    ls,
    cp,
    namesToFullPaths,
    filterOutSpecFiles,
    findTargetSourceFiles,
    sourceFileNameTo,
    copyTofolder,
    copyAll,
    writeFile,
    writeConfig,
    stageTarget,
    execError,
    execAsync,
    deploy,
    tempLocation,
    deployNewTarget,
    remove,
    listAbsolutePathsRecursively,
    rm,
    rmrf,
    removeTempDeployment,
    listTempDeployments,
    cleanupDeployments,
  },
} = require('./deployToTemp')

const missing = value =>
  strictEqual(value, undefined)

const values = ([
  'directory',
  'err',
  'names',
  'sourcePath',
  'destination',
  'data',
  'result',
  'instanceId',
  'stdout',
  'stderr',
  'command',
  'options',
])
  .reduce((result, key) => ({ [key]: { $: Symbol(key) }, ...result }), {})

const strictEqualTo = expected => value => strictEqual(value, expected)

const deepStrictEqualTo = expected => value => deepStrictEqual(value, expected)

const isValue = valueName =>
  actual => deepStrictEqual(actual, values[valueName])

const mockback = (expected, ...result) =>
  (...args) => {
    const callback = args.pop()
    deepStrictEqual(args, expected)
    callback(...result)
  }

// Takes an array of function calls where each call is in the form
//  [name, [args], returnValue]. Returns an object of mocks in the form
//  { functionName: () => {...}, ... }.
const sequence = (functions) => {
  const expected = [...functions]
  const mock = name =>
    (...args) => {
      const [expectedName, expectedArgs, returnValue] = expected.shift()
      deepStrictEqual([name, args], [expectedName, expectedArgs || []])
      return returnValue
    }
  return functions.reduce(
    (mocks, [name]) => (mocks[name]
      ? mocks
      : Object.assign({},
        mocks,
        { [name]: mock(name) })),
    {}
  )
}

describe('./tests/integration/deployToTemp', () => {
  describe('#mkdirp', () => {
    const expectedOptions = { recursive: true }
    const mkdirOk = mockback([values.directory, expectedOptions])
    const mkdirFail = mockback([values.directory, expectedOptions], values.err)
    it('should resolve empty on success', () =>
      mkdirp(mkdirOk)(values.directory)
        .then(missing))
    it('should resolve with the error on fail', () =>
      mkdirp(mkdirFail)(values.directory)
        .then(err => deepStrictEqual(err, values.err)))
  })

  describe('#ls', () => {
    const readdirOk = mockback([values.directory], undefined, values.names)
    const readdirFail = mockback([values.directory], values.err)
    it('should resolve names on success', () =>
      ls(readdirOk)(values.directory).then(isValue('names')))
    it('should resolve empty array on fail', () =>
      ls(readdirFail)(values.directory)
        .then(names => deepStrictEqual(names, [])))
  })

  describe('#cp', () => {
    const copyFileOk = mockback([values.source, values.destination])
    const copyFileFail =
      mockback([values.source, values.destination], values.err)
    it('should resolve empty on success', () =>
      cp(copyFileOk)(values.destination)(values.source)
        .then(missing))
    it('should resolve with the error on fail', () =>
      cp(copyFileFail)(values.destination)(values.source)
        .then(err => deepStrictEqual(err, values.err)))
  })

  describe('#namesToFullPaths', () => {
    const directory = 'biz'
    const names = ['foo', 'bar']
    const expected = [`biz${sep}foo`, `biz${sep}bar`]
    it('should join names to the base path', () =>
      deepStrictEqual(namesToFullPaths(directory)(names), expected))
  })

  describe('#filterOutSpecFiles', () => {
    const names = ['foo.js', 'foo.spec.js']
    const expected = [names[0]]
    it('should filter out spec files', () =>
      deepStrictEqual(filterOutSpecFiles(names), expected))
  })

  describe('#findTargetSourceFiles', () => {
    const sourcePath = 'foo'
    const names = ['bar.js', 'bar.spec.js']
    const expected = [`foo${sep}bar.js`]
    const lsOk = path => Promise.resolve(path === sourcePath ? names : [])
    it('should resolve to target source file full paths', () =>
      findTargetSourceFiles(lsOk, sourcePath)()
        .then(fullPaths => deepStrictEqual(fullPaths, expected)))
  })

  describe('#sourceFileNameTo', () => {
    it('should re-root the source file path to the destination path', () =>
      strictEqual(
        sourceFileNameTo('foo')(`bar${sep}baz.js`),
        `foo${sep}baz.js`
      ))
  })

  describe('#copyTofolder', () => {
    const filePath = `foo${sep}first.js`
    const destination = 'bar'
    const expectedCpArgs = [`bar${sep}first.js`, filePath]
    const cpOk = destinationFile =>
      sourceFile =>
        deepStrictEqual([destinationFile, sourceFile], expectedCpArgs) ||
          Promise.resolve()
    it('should copy a source file to the destination folder', () =>
      copyTofolder(cpOk)(destination)(filePath)
        .then(missing)
    )
  })

  describe('#copyAll', () => {
    const destination = 'bar'
    const sourceFiles = [`foo${sep}first.js`, `foo${sep}second.js`]
    const expectedSourceFiles = [...sourceFiles]
    const copyTofolderOk = directory =>
      strictEqual(directory, destination) || (actual =>
        strictEqual(actual, expectedSourceFiles.shift()) || Promise.resolve())
    it('should copy all source files to the destination directory', () =>
      copyAll(copyTofolderOk)(destination)(sourceFiles)
        .then(() => strictEqual(expectedSourceFiles.length, 0))
        .then(missing))
  })

  describe('#writeFile', () => {
    const writeFileArgs = [values.destination, values.data]
    const writeFileOk = mockback(writeFileArgs)
    const writeFileFail = mockback(writeFileArgs, values.err)
    it('should resolve empty on success', () =>
      writeFile(writeFileOk)(values.destination, values.data)
        .then(missing))
    it('should reject with the error on fail', () =>
      writeFile(writeFileFail)(values.destination, values.data)
        .then(() => fail('should reject'), isValue('err')))
  })

  describe('#writeConfig', () => {
    const instanceId = 1234
    const expectedData = 'instanceId: 1234'
    const writeFileOk = (destination, data) =>
      deepStrictEqual([destination, data], [values.destination, expectedData])
    it('should write the yaml instance id', () =>
      writeConfig(writeFileOk)(values.destination, instanceId))
  })

  describe('#stageTarget', () => {
    const sourceFiles = ['foo/first.js', 'foo/second.js']
    const findTargetSourceFilesOk = () => Promise.resolve(sourceFiles)
    const copyAllOk = destination =>
      files =>
        deepStrictEqual([destination, files], [values.destination, sourceFiles])
        || Promise.resolve(values.result)
    const writeConfigOk = (destination, instanceId) =>
      previous =>
        deepStrictEqual(
          [previous, destination, instanceId],
          [values.result, values.destination, values.instanceId]
        ) || Promise.resolve()
    const writeConfigFail = () =>
      () => Promise.reject(values.err)
    const stageTargetOk =
      stageTarget(findTargetSourceFilesOk, copyAllOk, writeConfigOk)
    const stageTargetFail =
      stageTarget(findTargetSourceFilesOk, copyAllOk, writeConfigFail)
    it('should copy all source files and write config', () =>
      stageTargetOk(values.destination, values.instanceId))
    it('should reject on failure to write config', () =>
      stageTargetFail(values.destination, values.instanceId)
        .then(() => fail('should reject'), isValue('err')))
  })

  describe('#execError', () => {
    const err = { message: 'foo' }
    const stderr = 'bar'
    it('should include error message and stderr', () =>
      strictEqual(execError(err, stderr).message, 'foo bar'))
  })

  describe('#execAsync', () => {
    const execOk = mockback(
      [values.command, values.options],
      undefined, values.stdout
    )
    const execFail = mockback(
      [values.command, values.options],
      values.err, undefined, values.stderr
    )
    const execArgs = [values.command, values.options]
    const expectedError = new Error()
    const execErrorOk = (...args) =>
      deepStrictEqual(args, [values.err, values.stderr]) || expectedError
    it('should resolve to stdout', () =>
      execAsync(execOk)(...execArgs)
        .then(isValue('stdout')))
    it('should reject on fail', () =>
      execAsync(execFail, execErrorOk)(...execArgs)
        .then(
          () => fail('should reject'),
          err => strictEqual(err, expectedError)
        ))
  })

  describe('#deploy', () => {
    const execAsyncOk = (...args) =>
      deepStrictEqual(args, ['sls deploy', { cwd: values.directory }]) ||
        Promise.resolve()
    const error = new Error()
    const execAsyncFail = () => Promise.reject(error)
    it('should sls deploy in the given directory', () =>
      deploy(execAsyncOk)(values.directory))
    it('should pass through exec rejection', () =>
      deploy(execAsyncFail)()
        .then(() => fail('should reject'), err => strictEqual(err, error)))
  })

  describe('#tempLocation', () => {
    const instanceId = '123'
    const root = 'abc'
    const destination = `abc${sep}123`
    it('should join the root path and instance id', () =>
      deepStrictEqual(
        tempLocation(instanceId, root),
        { instanceId, destination }
      ))
  })

  describe('#deployNewTarget', () => {
    const error = new Error()
    const deployNewTargetWithMockSequence = (mockSequence) => {
      const mocks = sequence(mockSequence)
      return deployNewTarget(
        values, // provides { instanceId, destination }
        mocks.mkdirp,
        mocks.stageTarget,
        mocks.deploy,
        mocks.log,
        mocks.warn
      )()
    }
    it('should resolve after making directory, staging and deploying', () =>
      deployNewTargetWithMockSequence([
        ['mkdirp', [values.destination], Promise.resolve()],
        ['log', ['staging target', values.instanceId, 'to', values.destination]],
        ['stageTarget', [values.destination, values.instanceId], Promise.resolve()],
        ['log', ['deploying', values.destination]],
        ['deploy', [values.destination], Promise.resolve(values.stdout)],
      ]).then(strictEqualTo(true)))
    it('should continue staging/deploying and resolve after failing to make dir', () =>
      deployNewTargetWithMockSequence([
        ['mkdirp', [values.destination], Promise.resolve(error)],
        ['log', ['staging target', values.instanceId, 'to', values.destination]],
        ['stageTarget', [values.destination, values.instanceId], Promise.resolve()],
        ['log', ['deploying', values.destination]],
        ['deploy', [values.destination], Promise.resolve(values.stdout)],
      ]).then(strictEqualTo(true)))
    it('should reject when failing to stage target', () =>
      deployNewTargetWithMockSequence([
        ['mkdirp', [values.destination], Promise.resolve()],
        ['log', ['staging target', values.instanceId, 'to', values.destination]],
        ['stageTarget', [values.destination, values.instanceId], Promise.reject(error)],
        ['warn', ['failed to deploy a new target:', error.stack]],
      ]).then(strictEqualTo(false)))
    it('should reject when failing to deploy', () =>
      deployNewTargetWithMockSequence([
        ['mkdirp', [values.destination], Promise.resolve()],
        ['log', ['staging target', values.instanceId, 'to', values.destination]],
        ['stageTarget', [values.destination, values.instanceId], Promise.resolve()],
        ['log', ['deploying', values.destination]],
        ['deploy', [values.destination], Promise.reject(error)],
        ['warn', ['failed to deploy a new target:', error.stack]],
      ]).then(strictEqualTo(false)))
  })

  describe('#remove', () => {
    const execAsyncOk = (...args) =>
      deepStrictEqual(args, ['sls remove', { cwd: values.directory }]) ||
        Promise.resolve()
    const error = new Error()
    const execAsyncFail = () => Promise.reject(error)
    it('should sls deploy in the given directory', () =>
      remove(execAsyncOk)(values.directory))
    it('should pass through exec rejection', () =>
      remove(execAsyncFail)()
        .then(() => fail('should reject'), err => strictEqual(err, error)))
  })

  describe('#listAbsolutePathsRecursively', () => {
    const mockLs = fileSystem =>
      (basePath) => {
        const dir = basePath.split(sep).reduce(
          (fileSystemPart, pathPart) => fileSystemPart[pathPart],
          fileSystem
        )
        return Promise.resolve(Object.keys(dir))
      }
    const rootPath = 'foo'
    const assertPathsListedRecursively = (fileSystem, expected) => {
      const rootedFileSystem = { [rootPath]: fileSystem }
      return listAbsolutePathsRecursively(mockLs(rootedFileSystem))(rootPath)
        .then(paths => [...paths].sort())
        .then(deepStrictEqualTo([...expected].sort()))
    }
    it('resolves to only the root path when no sub-files exist', () =>
      assertPathsListedRecursively({}, [rootPath]))
    it('resolves to the root path and nested child paths', () =>
      assertPathsListedRecursively(
        {
          l1a: {
            l2a: {},
            l2b: {},
          },
          l2a: {},
        },
        [
          rootPath,
          [rootPath, 'l1a'].join(sep),
          [rootPath, 'l1a', 'l2a'].join(sep),
          [rootPath, 'l1a', 'l2b'].join(sep),
          [rootPath, 'l2a'].join(sep),
        ]
      ))
  })

  describe('#rm', () => {
    const unlinkOk = mockback([values.directory])
    const unlinkFail =
      mockback([values.directory], values.err)
    it('should resolve empty on success', () =>
      rm(unlinkOk)(values.directory)
        .then(missing))
    it('should resolve with the error on fail', () =>
      rm(unlinkFail)(values.directory)
        .then(err => deepStrictEqual(err, values.err)))
  })

  describe('#rmrf', () => {
    const files = ['foo', 'bar']
    const listAllOk = directory =>
      isValue('directory')(directory) || Promise.resolve(files)
    const rmOk = path => Promise.resolve(path)
    it('should remove all listed files and directories', () =>
      rmrf(listAllOk, rmOk)(values.directory)
        .then(removed => [...removed].sort())
        .then(deepStrictEqualTo([...files, values.directory].sort())))
  })

  describe('#removeTempDeployment', () => {
    const removeTempDeploymentWithMockSequence = (mockSequence) => {
      const mocks = sequence(mockSequence)
      return removeTempDeployment(
        mocks.log,
        mocks.remove,
        mocks.warn,
        mocks.rmrf
      )(values.directory)
    }
    const error = new Error()
    it('should resolve and log on successful remove and rmrf', () =>
      removeTempDeploymentWithMockSequence([
        ['log', ['removing temp deployment', values.directory]],
        ['remove', [values.directory], Promise.resolve(values.stdout)],
        ['rmrf', [values.directory], Promise.resolve(values.directory)],
      ])
        .then(isValue('directory')))
    it('should warn and resolve on unsuccessful remove and rmrf', () =>
      removeTempDeploymentWithMockSequence([
        ['log', ['removing temp deployment', values.directory]],
        ['remove', [values.directory], Promise.reject(error)],
        ['warn', ['failed to sls remove', values.directory, ':', error.stack]],
        ['rmrf', [values.directory], Promise.resolve(values.directory)],
      ])
        .then(isValue('directory')))
  })

  describe('#listTempDeployments', () => {
    const root = 'foo'
    const directories = ['first', 'second']
    const lsOk = directory =>
      strictEqual(directory, root) || Promise.resolve(directories)
    it('should list all directories in the root path', () =>
      listTempDeployments(lsOk)(root)
        .then(deepStrictEqualTo([`foo${sep}first`, `foo${sep}second`])))
  })

  describe('#cleanupDeployments', () => {
    const root = 'temp'
    const cleanupDeploymentsWithMockSequence = (mockSequence) => {
      const mocks = sequence(mockSequence)
      return cleanupDeployments(
        mocks.list,
        mocks.remove,
        mocks.log,
        root
      )()
    }
    const directories = ['foo', 'bar']
    it('should resolve after logging, listing and removing each deployment', () =>
      cleanupDeploymentsWithMockSequence([
        ['log', ['cleaning up deployments in', root]],
        ['list', [], Promise.resolve(directories)],
        ['remove', ['foo'], Promise.resolve()],
        ['remove', ['bar'], Promise.resolve()],
      ]))
  })
})
