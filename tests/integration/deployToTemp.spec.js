const { assert: { strictEqual, deepStrictEqual, fail } } = require('chai')

const {
  pure: {
    mkdirp,
    ls,
    cp,
  },
} = require('./deployToTemp')

const missing = value =>
  strictEqual(value, undefined)

const values = (['directory', 'err', 'names'])
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
})
