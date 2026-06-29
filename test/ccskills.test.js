// test/ccskills.test.js
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ccskills = require('../lib/ccskills');

function mkFixture() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsk-'));
  const w = (p, c) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, c); };
  w(path.join(base, 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: do foo things\n---\n# Foo\nbody');
  w(path.join(base, 'skills', 'bar', 'SKILL.md'), '# Bar\nno frontmatter');
  w(path.join(base, 'plugins/cache/mk1/plug1/1.0/skills/baz/SKILL.md'), '---\nname: baz\ndescription: "do baz"\n---\n');
  w(path.join(base, 'commands', 'mycmd.md'), '---\ndescription: my command\n---\nbody');
  w(path.join(base, 'commands', 'hidden.md'), '---\ndescription: hidden\nhide-from-slash-command-tool: "true"\n---\n');
  return base;
}

test('parseFrontmatter: 提 name+description', () => {
  const fm = ccskills.parseFrontmatter('---\nname: foo\ndescription: do foo\n---\nbody');
  assert.equal(fm.name, 'foo');
  assert.equal(fm.description, 'do foo');
});

test('parseFrontmatter: 无 frontmatter 返回 {}', () => {
  assert.deepEqual(ccskills.parseFrontmatter('# no fm\nbody'), {});
});

test('parseFrontmatter: description 带引号去掉', () => {
  const fm = ccskills.parseFrontmatter('---\ndescription: "quoted desc"\n---\n');
  assert.equal(fm.description, 'quoted desc');
});

test('scanSkills: 扫 user+plugin，提 name/description/source', () => {
  const base = mkFixture();
  try {
    const skills = ccskills.scanSkills(base);
    assert.deepEqual(skills.map(s => s.name).sort(), ['bar', 'baz', 'foo']);
    const foo = skills.find(s => s.name === 'foo');
    assert.equal(foo.description, 'do foo things');
    assert.equal(foo.source, 'user');
    const baz = skills.find(s => s.name === 'baz');
    assert.equal(baz.description, 'do baz');
    assert.equal(baz.source, 'plugin:plug1');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('scanSkills: 无 skills 目录返回 []', () => {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'ccsk2-'));
  try { assert.deepEqual(ccskills.scanSkills(base), []); }
  finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('scanCommands: 扫 commands，过滤 hide', () => {
  const base = mkFixture();
  try {
    const cmds = ccskills.scanCommands(base);
    assert.deepEqual(cmds.map(c => c.name), ['mycmd']);
    assert.equal(cmds[0].description, 'my command');
  } finally { fs.rmSync(base, { recursive: true, force: true }); }
});

test('formatCheatSheet: 分组输出含 commands/user/plugin/built-in', () => {
  const skills = [
    { name: 'foo', description: 'do foo', source: 'user' },
    { name: 'baz', description: 'do baz', source: 'plugin:plug1' },
  ];
  const cmds = [{ name: 'mycmd', description: 'my command' }];
  const out = ccskills.formatCheatSheet(skills, cmds, '/clear /compact /model');
  assert.match(out, /自定义命令/);
  assert.match(out, /\/mycmd/);
  assert.match(out, /User skills/);
  assert.match(out, /Plugin: plug1/);
  assert.match(out, /foo/);
  assert.match(out, /Built-in/);
  assert.match(out, /\/clear/);
});
