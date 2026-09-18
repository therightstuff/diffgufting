export const usage = `Usage: diffgufting LEFT RIGHT [--wait]
  --left PATH | --left-repo REPO --left-ref REV [--left-path PATH]
  --right PATH | --right-repo REPO --right-ref REV [--right-path PATH]
  --base PATH | --base-repo REPO --base-ref REV [--base-path PATH]
  --output PATH         Editable three-way merge result
  --git-base REV        Committed layer base for live Git sources (default HEAD)
  --wait                Wait until this window closes
Git REV selectors: commit/branch, @index, @worktree, @base, @ours, @theirs.
Use -- before positional paths beginning with a dash.`;

export function parseArguments(argv) {
  const values = {}; const positional = [];
  const allowed = new Set(['left', 'right', 'base', 'output', 'git-base', ...['left', 'right', 'base'].flatMap(side => [`${side}-repo`, `${side}-ref`, `${side}-path`])]);
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') { positional.push(...argv.slice(i + 1)); break; }
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--wait') { values.wait = true; continue; }
    if (!arg.startsWith('--')) { positional.push(arg); continue; }
    const key = arg.slice(2);
    if (!allowed.has(key)) throw new Error(`Unknown option ${arg}. Use --help.`);
    if (key in values) throw new Error(`Duplicate option ${arg}`);
    if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new Error(`Missing value for ${arg}`);
    values[key] = argv[++i];
  }
  if (positional.length) {
    if (positional.length !== 2 || values.left || values.right || values['left-repo'] || values['right-repo']) throw new Error('Supply exactly two sources, using positional paths or explicit source options');
    [values.left, values.right] = positional;
  }
  function source(side, required) {
    if (values[side] && (values[`${side}-repo`] || values[`${side}-ref`] || values[`${side}-path`])) throw new Error(`Conflicting ${side} source options`);
    if (values[side]) return { kind: 'file', path: values[side] };
    if (values[`${side}-repo`] || values[`${side}-ref`] || values[`${side}-path`]) {
      if (!values[`${side}-repo`] || !values[`${side}-ref`]) throw new Error(`${side} Git source requires both repo and ref`);
      return { kind: 'git', repo: values[`${side}-repo`], ref: values[`${side}-ref`], path: values[`${side}-path`] ?? '' };
    }
    if (required) throw new Error('Supply two sources. Use --help for examples.');
    return null;
  }
  const result = { left: source('left', true), right: source('right', true), base: source('base', false), output: values.output ?? null, gitBase: values['git-base'] ?? 'HEAD', wait: !!values.wait };
  if (!!result.base !== !!result.output) throw new Error('Three-way merge requires both --base (or base Git source) and --output');
  return result;
}
