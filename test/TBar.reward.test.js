const {expectRevert, time} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const YaxisToken = artifacts.require('YaxisToken');
const TBar = artifacts.require('TBar');

const MockERC20 = artifacts.require('MockERC20');

const verbose = process.env.VERBOSE;

async function advanceBlocks(blocks) {
    for (let i = 0; i < blocks; i++) {
        await time.advanceBlock();
    }
}

function getRandomInt(min, max) {
    return min + Math.floor(Math.random() * Math.floor(max - min));
}

contract('TBar.reward.test', async (accounts) => {
    const {toWei} = web3.utils;
    const {fromWei} = web3.utils;

    const alice = accounts[0];
    const bob = accounts[1];
    const carol = accounts[2];

    const MAX = web3.utils.toTwosComplement(-1);

    let yax;
    let YAX;

    let bar;
    let BAR;

    let totalReward;

    before(async () => {
        yax = await YaxisToken.new('10000000000');
        YAX = yax.address;

        const blockNumber = await time.latestBlock();
        bar = await TBar.new(YAX, blockNumber + 10);
        BAR = bar.address;

        totalReward = await bar.accReleasedRwds(5);
        await yax.mint(BAR, String(totalReward)); // prepare for rewards
        if (verbose) {
            console.log('totalReward = %s', String(totalReward));
            console.log('bar.totalBalance(YAX) = %s', String(await yax.balanceOf(BAR)));

            for (let i = 0; i < 6; i++) console.log('epEndBlks[%d]       = %s', i, String(await bar.epEndBlks(i)));
            for (let i = 0; i < 6; i++) console.log('epRwdPerBlks[%d]    = %s', i, String(await bar.epRwdPerBlks(i)));
            for (let i = 0; i < 6; i++) console.log('accReleasedRwds[%d] = %s', i, String(await bar.accReleasedRwds(i)));
        }

        await yax.mint(alice, '1000000');
        await yax.mint(bob, '1000000');
        await yax.mint(carol, '1000000');

        await yax.approve(BAR, MAX, {from: alice});
        await yax.approve(BAR, MAX, {from: bob});
        await yax.approve(BAR, MAX, {from: carol});
    });

    describe('TBar should work', () => {
        it('alice, bob and carol enter/leave the bar', async () => {
            const _startBlk = Number(await bar.epEndBlks(0));
            await time.advanceBlockTo(_startBlk);
            for (let round = 1; round <= 22; round++) {
                if (verbose) console.log('\n===== Round %d ===== Blk = %d', round, String(await time.latestBlock()));
                for (let i = 0; i < 3; i++) {
                    let _amount = getRandomInt(0, 10);
                    _amount = _amount * 100000;
                    const _bal = Number(await yax.balanceOf(accounts[i]));
                    if (_amount > _bal) _amount = _bal;
                    if (_amount == 0) continue;
                    if (verbose) console.log('accounts[%d] enter %d YAX', i, _amount);
                    await bar.enter(String(_amount), {from: accounts[i]});
                }
                for (let i = 0; i < 3; i++) {
                    let _amount = getRandomInt(0, 5);
                    _amount = _amount * 100000;
                    const _bal = Number(await bar.balanceOf(accounts[i]));
                    if (_amount > _bal) _amount = _bal;
                    if (_amount == 0) continue;
                    if (verbose) console.log('accounts[%d] leave %d sYAX', i, _amount);
                    await bar.leave(String(_amount), {from: accounts[i]});
                }
                if (verbose) {
                    console.log('bar YAX = %s', String(await yax.balanceOf(BAR)));
                    console.log('bar totalSupply = %s', String(await bar.totalSupply()));
                    console.log('at blk %s: bar getPricePerFullShare = %s', String(await time.latestBlock()), String(Number(fromWei(await bar.getPricePerFullShare()))));
                }
                await advanceBlocks(5);
                await yax.mint(BAR, 10000);
            }
        });

        it('everyone leave the bar => should get all 108k + 220k extra YAX', async () => {
            if (verbose) console.log('at blk %s: bar getPricePerFullShare = %s', String(await time.latestBlock()), String(Number(fromWei(await bar.getPricePerFullShare()))));
            await advanceBlocks(10);
            if (verbose) console.log('at blk %s: bar getPricePerFullShare = %s', String(await time.latestBlock()), String(Number(fromWei(await bar.getPricePerFullShare()))));
            let totalYAX = 0;
            for (let i = 0; i < 3; i++) {
                await bar.exit({from: accounts[i]});
                const _bal = String(await yax.balanceOf(accounts[i]));
                if (verbose) console.log('accounts[%d] YAX = %s', i, String(totalYAX));
                totalYAX += Number(_bal);
            }
            const _expectedTotalYAX = 3 * 1000000 + 108000 + 220000;
            if (verbose) {
                console.log('totalYAX = %s', String(totalYAX));
                console.log('bar.totalSupply() = %s', String(await bar.totalSupply()));
                console.log('bar YAX = %s', String(await yax.balanceOf(BAR)));
            }
            assert.equal(String(totalYAX), String(_expectedTotalYAX));
            assert.equal(String(await bar.totalSupply()), '0');
            assert.equal(String(await yax.balanceOf(BAR)), '0');
        });
    });
});
