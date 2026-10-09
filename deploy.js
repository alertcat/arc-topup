const fs = require('fs');
const solc = require('solc');
const { JsonRpcProvider, FetchRequest, Wallet, ContractFactory, Network, formatEther } = require('ethers');
const src = fs.readFileSync('contracts/ArcTopUp.sol', 'utf8');
const input = { language: 'Solidity', sources: { 'ArcTopUp.sol': { content: src } },
  settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris',
    outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object', 'metadata'] } } } };
const out = JSON.parse(solc.compile(JSON.stringify(input)));
if (out.errors) { for (const e of out.errors) console.error(e.formattedMessage); if (out.errors.some(e => e.severity === 'error')) process.exit(1); }
const c = out.contracts['ArcTopUp.sol'].ArcTopUp;
fs.writeFileSync('build/ArcTopUp.json', JSON.stringify({ abi: c.abi, bytecode: '0x' + c.evm.bytecode.object, deployedBytecode: '0x' + c.evm.deployedBytecode.object, metadata: c.metadata }, null, 1));
console.log('compiled: bytecode bytes', c.evm.bytecode.object.length / 2);
if (process.argv[2] !== '--deploy') process.exit(0);
const w = JSON.parse(fs.readFileSync(process.env.DEPLOYER_KEY_FILE || 'deployer.json', 'utf8'));
const req = new FetchRequest('https://rpc.mainnet.arc.io'); req.setHeader('user-agent', 'Mozilla/5.0');
const provider = new JsonRpcProvider(req, Network.from({ chainId: 5042, name: 'arc' }), { staticNetwork: true });
const wallet = new Wallet(w.privateKey, provider);
const treasury = process.argv[3] || wallet.address;
(async () => {
  const bal = await provider.getBalance(wallet.address);
  console.log('deployer', wallet.address, 'balance USDC', formatEther(bal), 'treasury', treasury);
  const f = new ContractFactory(c.abi, '0x' + c.evm.bytecode.object, wallet);
  const ct = await f.deploy(treasury);
  const tx = ct.deploymentTransaction();
  console.log('deploy tx', tx.hash);
  const rc = await tx.wait();
  const addr = await ct.getAddress();
  console.log('contract', addr, 'block', rc.blockNumber, 'gasUsed', rc.gasUsed.toString(), 'fee USDC', formatEther(rc.gasUsed * rc.gasPrice));
  const owner = process.argv[4];
  if (owner && owner.toLowerCase() !== wallet.address.toLowerCase()) {
    const t2 = await ct.transferOwnership(owner);
    await t2.wait();
    console.log('ownership transferred to', owner, 'tx', t2.hash);
  }
  fs.writeFileSync('build/deployment.json', JSON.stringify({ address: addr, txHash: tx.hash, block: rc.blockNumber, deployer: wallet.address, treasury, owner: owner || wallet.address, chainId: 5042, compiler: 'v0.8.28+commit.7893614a', optimizer: { enabled: true, runs: 200 }, evmVersion: 'paris', deployedAt: new Date().toISOString() }, null, 1));
})().catch(e => { console.error('ERR', e.shortMessage || e.message); process.exit(1); });
