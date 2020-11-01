const {expectRevert, time} = require('@openzeppelin/test-helpers');
const {expect} = require('chai');

const YaxisToken = artifacts.require('YaxisToken');
const YaxisBar = artifacts.require('YaxisBar');

const MockERC20 = artifacts.require('MockERC20');

const verbose = process.env.VERBOSE;

contract('YaxisBar.test', async (accounts) => {
    const { toWei } = web3.utils;
    const { fromWei } = web3.utils;

    const alice = accounts[0];
    const bob = accounts[1];

    const MAX = web3.utils.toTwosComplement(-1);
    const INIT_BALANCE = toWei('1000');

    let yax;
    let YAX;

    let bar;
    let BAR;

    let totalReward;

    before(async () => {
        yax = await YaxisToken.new(toWei('1000000'));
        YAX = yax.address;

        const blockNumber = await time.latestBlock();
        bar = await YaxisBar.new(YAX, blockNumber + 10);
        BAR = bar.address;

        totalReward = await bar.accReleasedRwds(5);
        await yax.mint(BAR, String(totalReward)); // prepare for rewards
    });

    describe('bar should work', () => {
        it('should have correct name and symbol and decimal', async () => {
            const name = await bar.name();
            const symbol = await bar.symbol();
            const decimals = await bar.decimals();
            const totalSupply = await bar.totalSupply();
            assert.equal(name.valueOf(), 'Staked yAxis');
            assert.equal(symbol.valueOf(), 'sYAX');
            assert.equal(decimals.valueOf(), '18');
            assert.equal(totalSupply.valueOf(), '0');
        });

        it('should only allow governance to rescue stuck non-core tokens', async () => {
            const junk = await MockERC20.new('Junk Token', 'JUNK', 1000);
            await junk.transfer(BAR, 10);
            await yax.mint(BAR, 10);
            await expectRevert(
                bar.governanceRecoverUnsupported(junk.address, '10', bob, {from: bob}),
                '!governance',
            );
            await expectRevert(
                bar.governanceRecoverUnsupported(YAX, '10', bob, {from: alice}),
                'YAX',
            );
            await bar.governanceRecoverUnsupported(junk.address, '10', bob, {from: alice});
            assert.equal(String(await junk.balanceOf(BAR)), '0');
            assert.equal(String(await junk.balanceOf(bob)), '10');
        });

        it('bob enter bar: 10 YAX', async () => {
            const _amount = toWei('10');
            await expectRevert(
                bar.enter(_amount, {from: bob}),
                'revert ERC20: transfer amount exceeds balance'
            );
            await yax.mint(bob, INIT_BALANCE);
            await expectRevert(
                bar.enter(_amount, {from: bob}),
                'revert ERC20: transfer amount exceeds allowance'
            );
            await yax.approve(BAR, MAX, {from: bob});
            await bar.enter(_amount, {from: bob});
            if (verbose) {
                console.log('totalReward = %s', String(fromWei(totalReward)));
                console.log('bar.totalBalance(YAX) = %s', String(Number(totalReward) + Number(_amount)));
            }
            assert.approximately(Number(await yax.balanceOf(BAR)), Number(totalReward) + Number(_amount), 10 ** -12);
            assert.equal(String(await yax.balanceOf(bob)), toWei('990'));
            assert.equal(String(await bar.balanceOf(bob)), toWei('10'));
            assert.equal(String(await bar.totalSupply()), toWei('10'));
            assert.equal(String(await bar.releasedRewards()), toWei('0'));
            assert.approximately(Number(await bar.getPricePerFullShare()), Number(toWei('1')), 10 ** -12);
        });

        it('advance 100 blocks and should have some incentive now', async () => {
            await bar.enter(toWei('490'), {from: bob});
            assert.equal(String(await yax.balanceOf(bob)), toWei('500'));
            assert.approximately(Number(await bar.balanceOf(bob)), Number(toWei('500')), 10 ** -12);
            if (verbose) {
                for (let i = 0; i < 6; i++) console.log('epEndBlks[%d]       = %s', i, String(await bar.epEndBlks(i)));
                for (let i = 0; i < 6; i++) console.log('epRwdPerBlks[%d]    = %s', i, fromWei(await bar.epRwdPerBlks(i)));
                for (let i = 0; i < 6; i++) console.log('accReleasedRwds[%d] = %s', i, fromWei(await bar.accReleasedRwds(i)));
            }
            const _startBlk = Number(await bar.epEndBlks(0));
            await time.advanceBlockTo(_startBlk + 100);
            if (verbose) {
                console.log('current block number = %s', String(await time.latestBlock()));
                console.log('bar.totalSupply() = %s', String(await bar.totalSupply()));
            }
            assert.approximately(Number(await bar.releasedRewards()), Number(toWei('12.9032258064516')), 10 ** -12);
            const expectedPrice = (500.0 + 12.9032258064516) / 500.0;
            assert.approximately(Number(fromWei(await bar.getPricePerFullShare())), Number(expectedPrice), 10 ** -12);
        });

        it('bob leave 100 sYAX', async () => {
            if (verbose) {
                console.log('bob.balanceOf(YAX) = %s', fromWei(await yax.balanceOf(bob)));
            }
            await bar.leave(toWei('100'), {from: bob});
            const price = Number(fromWei(await bar.getPricePerFullShare()));
            const expectedReturn = 100.0 * price;
            if (verbose) {
                console.log('bar.getPricePerFullShare = %s', String(price));
                console.log('expectedReturn = %s', String(expectedReturn));
            }
            assert.approximately(Number(fromWei(await yax.balanceOf(bob))), Number(500) + Number(expectedReturn), 10 ** -12);
            assert.approximately(Number(fromWei(await bar.balanceOf(bob))), Number('400'), 10 ** -12);
        });

        it('send in profit should increase pricePerShare', async () => {
            const priceBefore = Number(fromWei(await bar.getPricePerFullShare()));
            if (verbose) {
                console.log('[before] bar.getPricePerFullShare = %s', String(priceBefore));
            }
            await yax.mint(BAR, toWei('10'));
            const priceAfter = Number(fromWei(await bar.getPricePerFullShare()));
            if (verbose) {
                console.log('[after]  bar.getPricePerFullShare = %s', String(priceAfter));
                console.log('[after]  bar.compounded_apy = %s', String(await bar.compounded_apy()));
                console.log('[after]  bar.incentive_apy = %s', String(await bar.incentive_apy()));
            }
            expect(priceAfter).to.be.greaterThan(priceBefore, 'priceAfter must be greater than priceBefore');
        });
    });
});
