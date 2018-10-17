const { assert: { strictEqual, deepStrictEqual, fail } } = require('chai')

const {
  pure: {
    execAsync,
    listTargetFiles,
    stageTarget,
  },
} = require('./deployToTemp')

const condenseWhitespace = input =>
  input.replace(/\s+/g, ' ')

describe('./tests/integration/deployToTemp', () => {
  describe('#execAsync', () => {
    const values = (['command', 'options', 'err', 'stdout', 'stderr'])
      .reduce((result, key) => ({ [key]: { $: Symbol(key) }, ...result }), {})
    values.err.message = 'reasons'
    values.stderr.toString = () => 'more reasons'
    const execOk = (command, options, callback) =>
      deepStrictEqual([command, options], [values.command, values.options]) ||
      process.nextTick(() => callback(undefined, values.stdout, values.stderr))
    const execFail = (command, options, callback) =>
      deepStrictEqual([command, options], [values.command, values.options]) ||
      process.nextTick(() => callback(values.err, values.stdout, values.stderr))
    it('should return stdout on success', () =>
      execAsync(execOk)(values.command, values.options)
        .then(result => strictEqual(result, values.stdout)))
    it('should reject on fail', () =>
      execAsync(execFail)(values.command, values.options)
        .then(
          result => fail(result, '[Promise rejection]'),
          err => strictEqual(err.message, 'reasons more reasons')
        ))
  })

  describe('#listTargetFiles', () => {
    const expectedCommand = "find serverless.yml *.js ! -name '*.spec.js*'"
    const rawList = '\nfoo \n\tbar \n'
    const expectedList = ['foo', 'bar']
    const execOk = command =>
      strictEqual(command, expectedCommand) ||
      Promise.resolve(rawList)
    const error = new Error('reasons')
    const execFail = () => Promise.reject(error)
    it('should return a clean list of target files', () =>
      listTargetFiles(execOk)()
        .then(list => deepStrictEqual(list, expectedList)))
    it('should should pass through on fail', () =>
      listTargetFiles(execFail)()
        .catch(err => err)
        .then(err => strictEqual(err, error)))
  })

  describe('#stageTarget', () => {
    const destination = 'dest'
    const fileList = ['foo', 'bar']
    const instanceId = 'ABCD'
    const expectedCommand =
      'mkdir -p dest && cp foo bar dest && echo "instanceId: ABCD" >> dest/config.yml'
    const execOk = command =>
      strictEqual(condenseWhitespace(command), expectedCommand) ||
      Promise.resolve()
    const error = new Error('reasons')
    const execFail = () => Promise.reject(error)
    it('should return a clean list of target files', () =>
      stageTarget(execOk)(destination, fileList, instanceId))
    it('should should pass through on fail', () =>
      stageTarget(execFail)(destination, fileList, instanceId)
        .catch(err => err)
        .then(err => strictEqual(err, error)))
  })
})
