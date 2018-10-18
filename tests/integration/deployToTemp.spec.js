const { assert: { strictEqual, deepStrictEqual } } = require('chai')
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
  },
} = require('./deployToTemp')

const missing = value =>
  strictEqual(value, undefined)

const values = (['directory', 'err', 'names', 'sourcePath'])
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
})
