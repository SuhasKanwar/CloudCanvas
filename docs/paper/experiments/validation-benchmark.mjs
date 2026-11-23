import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import os from 'node:os';
import crypto from 'node:crypto';
import { validateGraphObject, createGraphPlan, graphSchema } from '../../../contracts/dist/index.js';

const here = fileURLToPath(new URL('.', import.meta.url));
const repo = fileURLToPath(new URL('../../../', import.meta.url));
const require = createRequire(new URL('../../../contracts/package.json', import.meta.url));
const Ajv2020 = require('ajv/dist/2020.js').default;
const schema = new Ajv2020({ allErrors: true, useDefaults: true, strict: false }).compile(graphSchema);
const node = (id, type, config) => ({ id, type, config });
const edge = (sourceNodeId, targetNodeId) => ({ sourceNodeId, targetNodeId });
const graph = (nodes, edges = []) => ({ schemaVersion: 1, name: 'Offline conformance fixture', nodes, edges });
const frontend = () => graph([
  node('bucket', 'S3_BUCKET', { bucketName: 'paper-fixture-assets' }),
  node('cdn', 'CLOUDFRONT_DISTRIBUTION', { bucketName: '${bucket.bucketName}' }),
], [edge('bucket', 'cdn')]);
const bases = [
  () => graph([node('s3', 'S3_BUCKET', { bucketName: 'paper-assets' }), node('db', 'DYNAMODB_TABLE', { tableName: 'paper-table', keySchema: [{ AttributeName: 'id', KeyType: 'HASH' }], attributeDefinitions: [{ AttributeName: 'id', AttributeType: 'S' }] })]),
  () => graph([node('ecr', 'ECR_REPOSITORY', { repositoryName: 'paper-repository' })]),
  () => graph([node('queue', 'SQS_QUEUE', { queueName: 'paper-queue' })]),
  () => graph([node('topic', 'SNS_TOPIC', { topicName: 'paper-topic' })]),
  () => graph([node('key', 'KEY_PAIR', { keyName: 'paper-key', mode: 'existing' }), node('vm', 'EC2_INSTANCE', { keyName: '${key.keyName}' })], [edge('key', 'vm')]),
  () => graph([node('sg', 'SECURITY_GROUP', { mode: 'existing', groupId: 'sg-example' }), node('vm', 'EC2_INSTANCE', { securityGroupIds: ['${sg.securityGroupId}'] })], [edge('sg', 'vm')]),
  () => graph([node('role', 'IAM_ROLE', { roleName: 'paper-role', trustedService: 'lambda.amazonaws.com' }), node('fn', 'LAMBDA_FUNCTION', { roleArn: '${role.roleArn}' })], [edge('role', 'fn')]),
  frontend,
];
const mutations = {
  shape: [
    ['missing-version', g => { delete g.schemaVersion; }],
    ['unknown-property', g => { g.unrecognized = true; }],
    ['empty-name', g => { g.name = ''; }],
    ['unsupported-type', g => { g.nodes[0].type = 'UNSUPPORTED_SERVICE'; }],
    ['wrong-config-type', g => { g.nodes[0].config.bucketName = 42; }],
    ['wrong-node-container', g => { g.nodes = {}; }],
    ['empty-node-id', g => { g.nodes[0].id = ''; }],
    ['wrong-position-type', g => { g.nodes[0].positionX = 'left'; }],
  ],
  topology: [
    ['duplicate-node-id', g => { g.nodes.push(structuredClone(g.nodes[0])); }],
    ['unknown-source', g => { g.edges[0].sourceNodeId = 'absent'; }],
    ['unknown-target', g => { g.edges[0].targetNodeId = 'absent'; }],
    ['self-edge', g => { g.edges = [edge('bucket', 'bucket')]; }],
    ['incompatible-edge', g => { g.edges = [edge('cdn', 'bucket')]; }],
    ['duplicate-edge', g => { g.edges.push(structuredClone(g.edges[0])); }],
    ['multiple-origins', g => { g.nodes.push(node('other', 'S3_BUCKET', { bucketName: 'paper-other' })); g.edges.push(edge('other', 'cdn')); }],
    ['cyclic-incompatible-edges', g => { g.edges.push(edge('cdn', 'bucket')); }],
  ],
  references: [
    ['missing-direct-edge', g => { g.edges = []; }],
    ['unknown-reference-source', g => { g.nodes[1].config.bucketName = '${absent.bucketName}'; }],
    ['interpolated-reference', g => { g.nodes[1].config.bucketName = 'prefix-${bucket.bucketName}'; }],
    ['unterminated-reference', g => { g.nodes[1].config.bucketName = '${bucket.bucketName'; }],
    ['self-reference', g => { g.nodes[1].config.bucketName = '${cdn.bucketName}'; }],
    ['invalid-output-token', g => { g.nodes[1].config.bucketName = '${bucket.1bad}'; }],
    ['array-without-source-edge', g => { Object.assign(g, graph([node('sg', 'SECURITY_GROUP', { mode: 'existing', groupId: 'sg-example' }), node('vm', 'EC2_INSTANCE', { securityGroupIds: ['${sg.securityGroupId}'] })])); }],
    ['nested-unbound-reference', g => { Object.assign(g, graph([node('sg', 'SECURITY_GROUP', { groupName: 'paper', description: 'fixture', vpcId: 'vpc-example', ingressRules: [{ protocol: 'tcp', cidrIpv4: '10.0.0.0/8', fromPort: 443, toPort: 443, description: '${absent.label}' }] })])); }],
  ],
};
const corpus = [];
for (let i = 0; i < bases.length; i++) for (let v = 0; v < 3; v++) {
  const input = bases[i](); input.name += ` valid-${i}-${v}`;
  input.nodes.forEach(n => { n.positionX = v * 100; n.positionY = i * 50; });
  corpus.push({ id: `valid-${i}-${v}`, category: 'valid', expectedValid: true, input });
}
for (const [category, families] of Object.entries(mutations)) for (const [family, mutate] of families) for (let v = 0; v < 2; v++) {
  const input = frontend(); input.name += ` ${family}-${v}`;
  input.nodes.forEach(n => { n.positionX = v * 100; });
  mutate(input);
  corpus.push({ id: `${family}-${v}`, category, expectedValid: false, input });
}
const controls = [
  { id: 'unknown-output-name', reason: 'Output-field existence is checked during runtime reference resolution.', input: frontend() },
  { id: 'incomplete-lambda-draft', reason: 'Incomplete Lambda drafts are allowed by the graph schema; publish requires deployment fields.', input: graph([node('fn', 'LAMBDA_FUNCTION', {})]) },
  { id: 'cloudfront-public-origin', reason: 'A connected public-origin setting passes graph validation but publish preflight rejects it.', input: frontend() },
  { id: 'lambda-wrong-trusted-service', reason: 'Type-compatible role attachment alone does not establish execution-role trust.', input: bases[6]() },
  { id: 'nonexistent-ami-string', reason: 'A literal identifier does not establish regional AWS availability.', input: graph([node('vm', 'EC2_INSTANCE', { imageId: 'ami-offline-example' })]) },
  { id: 'unmet-requested-service', reason: 'An external requirement for SNS is unmet by a structurally valid S3 graph.', input: graph([node('s3', 'S3_BUCKET', { bucketName: 'paper-assets' })]) },
];
controls[0].input.nodes[1].config.bucketName = '${bucket.nonexistentOutput}';
controls[2].input.nodes[0].config.blockPublicAccess = false;
controls[3].input.nodes[0].config.trustedService = 'ec2.amazonaws.com';
const validators = {
  'schema-only': x => { if (!schema(x)) throw new Error('Schema rejection'); },
  'schema-topology': x => { if (!schema(x)) throw new Error('Schema rejection'); createGraphPlan(x.nodes, x.edges); },
  'full-contract': validateGraphObject,
};
function accepts(fn, input) { try { fn(structuredClone(input)); return true; } catch { return false; } }
assert.equal(corpus.length, 72);
assert.deepEqual([...new Set(corpus.filter(c => c.expectedValid).flatMap(c => c.input.nodes.map(n => n.type)))].sort(), [...graphSchema.$defs.node.properties.type.enum].sort());
for (const c of corpus) assert.equal(accepts(validators['full-contract'], c.input), c.expectedValid, c.id);
for (const c of controls) assert(accepts(validators['full-contract'], c.input), c.id);
const runIndex = process.argv.indexOf('--run');
if (runIndex >= 0) {
  const run = Number(process.argv[runIndex + 1]);
  const names = Object.keys(validators);
  // Rotate fixed order to avoid confounding one validator with a single position.
  const order = names.slice(run - 1).concat(names.slice(0, run - 1));
  const measurements = [];
  for (const name of order) {
    const fn = validators[name];
    const decisions = corpus.map(c => ({ id: c.id, category: c.category, expectedValid: c.expectedValid, accepted: accepts(fn, c.input) }));
    for (let warm = 0; warm < 20; warm++) for (const c of corpus) accepts(fn, c.input);
    const start = process.hrtime.bigint();
    for (let repetition = 0; repetition < 50; repetition++) for (const c of corpus) accepts(fn, c.input);
    const elapsedMs = Number(process.hrtime.bigint() - start) / 1e6;
    const correct = decisions.filter(c => c.accepted === c.expectedValid).length;
    const falseAccepted = decisions.filter(c => !c.expectedValid && c.accepted).length;
    const falseRejected = decisions.filter(c => c.expectedValid && !c.accepted).length;
    measurements.push({ validator: name, correct, accuracy: correct / corpus.length, falseAccepted, falseRejected,
      meanMsPerGraph: elapsedMs / (50 * corpus.length), decisions });
  }
  console.log(JSON.stringify({ run, order, measurements, boundaryControls: controls.map(c => ({ id: c.id, reason: c.reason, accepted: accepts(validators['full-contract'], c.input) })) }));
} else {
  const out = new URL('../results/', import.meta.url); mkdirSync(out, { recursive: true });
  writeFileSync(new URL('corpus.json', out), JSON.stringify({ description: 'Synthetic conformance fixtures, not model-generated or deployment-qualified data', cases: corpus, boundaryControls: controls }, null, 2) + '\n');
  const runs = [];
  for (let run = 1; run <= 3; run++) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--run', String(run)], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    runs.push(JSON.parse(result.stdout));
  }
  const mean = values => values.reduce((a,b) => a+b, 0) / values.length;
  const sd = values => Math.sqrt(values.reduce((s,v) => s + (v - mean(values)) ** 2, 0) / (values.length - 1));
  const summary = Object.keys(validators).map(name => {
    const values = runs.map(r => r.measurements.find(m => m.validator === name));
    return { validator: name, accuracyMean: mean(values.map(x => x.accuracy)), accuracySd: sd(values.map(x => x.accuracy)),
      falseAcceptedMean: mean(values.map(x => x.falseAccepted)), falseAcceptedSd: sd(values.map(x => x.falseAccepted)),
      falseRejectedMean: mean(values.map(x => x.falseRejected)), meanMsPerGraph: mean(values.map(x => x.meanMsPerGraph)), sdMsPerGraph: sd(values.map(x => x.meanMsPerGraph)) };
  });
  const results = { generatedAt: new Date().toISOString(), sourceCommit: spawnSync('git', ['rev-parse','HEAD'], { cwd: repo, encoding:'utf8' }).stdout.trim(),
    contractSha256: crypto.createHash('sha256').update(readFileSync(repo+'contracts/src/index.ts')).digest('hex'),
    schemaSha256: crypto.createHash('sha256').update(readFileSync(repo+'contracts/graph.schema.json')).digest('hex'),
    environment: { node:process.version, platform:os.platform(), kernel:os.release(), arch:os.arch(), cpu:os.cpus()[0].model, logicalCpus:os.cpus().length, memoryGiB:os.totalmem()/2**30, ajv:require('ajv/package.json').version, yaml:require('yaml/package.json').version },
    settings: { independentProcesses:3, warmupPasses:20, timedPasses:50, cases:72, positive:24, invalid:48, casesPerFaultClass:16, boundaryControls:6, randomSeed:'not applicable: deterministic fixtures' }, summary, runs };
  writeFileSync(new URL('validation-results.json', out), JSON.stringify(results, null, 2) + '\n');
  const csv = ['validator,accuracy_mean,accuracy_sd,false_accepted_mean,false_accepted_sd,false_rejected_mean,ms_per_graph_mean,ms_per_graph_sd',
    ...summary.map(s => [s.validator,s.accuracyMean,s.accuracySd,s.falseAcceptedMean,s.falseAcceptedSd,s.falseRejectedMean,s.meanMsPerGraph,s.sdMsPerGraph].join(','))].join('\n');
  writeFileSync(new URL('validation-summary.csv', out), csv+'\n');
  console.log(JSON.stringify({ environment:results.environment, settings:results.settings, summary }, null, 2));
}
