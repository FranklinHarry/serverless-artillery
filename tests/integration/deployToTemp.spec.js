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

const isValue = valueName =>
  actual => deepStrictEqual(actual, values[valueName])

const mockback = (expected, ...result) =>
  (...args) => {
    const callback = args.pop()
    deepStrictEqual(args, expected)
    callback(...result)
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
    it('should sls deploy in the given directory', () =>
      deploy(execAsyncOk)(values.directory))
  })
})
