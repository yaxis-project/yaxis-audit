const {expectRevert, time} = require('@openzeppelin/test-helpers');

const YaxisToken = artifacts.require('YaxisToken');
const YaxisChef = artifacts.require('YaxisChef');
const MockERC20 = artifacts.require('MockERC20');

contract('YaxisChef', ([alice, bob, carol, tresury, minter]) => {
    beforeEach(async () => {
        this.yax = await YaxisToken.new(2000000, {from: alice});
    });

    it('should set correct state variables', async () => {
        this.chef = await YaxisChef.new(this.yax.address, tresury, '1000', '0', {from: alice});
        await this.yax.addMinter(this.chef.address, {from: alice});
        const yax = await this.chef.yax();
        const tresuryaddr = await this.chef.tresuryaddr();
        const governance = await this.yax.governance();
        assert.equal(yax.valueOf(), this.yax.address);
        assert.equal(tresuryaddr.valueOf(), tresury);
        assert.equal(governance.valueOf(), alice);
    });

    it('should allow tresury and only tresury to update tresury', async () => {
        this.chef = await YaxisChef.new(this.yax.address, tresury, '1000', '0', {from: alice});
        assert.equal((await this.chef.tresuryaddr()).valueOf(), tresury);
        await expectRevert(this.chef.tresury(bob, { from: bob }), 'tresury: wut?');
        await this.chef.tresury(bob, { from: tresury });
        assert.equal((await this.chef.tresuryaddr()).valueOf(), bob);
        await this.chef.tresury(alice, { from: bob });
        assert.equal((await this.chef.tresuryaddr()).valueOf(), alice);
    })

    it('test should give out YAXs only after farming time', async () => {
        this.chef = await YaxisChef.new(this.yax.address, tresury, '10', '50', {from: alice});
        console.log('startBlock=%s', String(await this.chef.startBlock().valueOf()));
        console.log('yaxPerBlock=%s', String(await this.chef.yaxPerBlock().valueOf()));
        console.log('totalSupply(YAX)=%s', String(await this.yax.totalSupply().valueOf()));
        await this.yax.addMinter(this.chef.address, {from: alice});
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', {from: minter});
        await this.lp.transfer(alice, '1000', {from: minter});
        await this.lp.transfer(bob, '1000', {from: minter});
        await this.lp.transfer(carol, '1000', {from: minter});
        await this.chef.add('100', this.lp.address, true, 0);
        // console.log('init: pool(0)=%s', JSON.stringify(await this.chef.poolInfo(0)));
        await this.lp.approve(this.chef.address, '1000', {from: bob});
        await this.lp.approve(this.chef.address, '1000', {from: carol});
        await this.chef.deposit(0, '100', {from: bob});
        // console.log('bob deposit: pool(0)=%s', JSON.stringify(await this.chef.poolInfo(0)));
        await this.chef.deposit(0, '100', {from: carol});
        // console.log('carol deposit: pool(0)=%s', JSON.stringify(await this.chef.poolInfo(0)));
        assert.equal((await this.yax.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.yax.balanceOf(carol)).valueOf(), '0');

        for (let i = 0; i < 5; i++) {
            console.log('block: %d', 30 + i * 10);
            await time.advanceBlockTo(30 + i * 10);
            await this.chef.deposit(0, '0', {from: bob});
            await this.chef.deposit(0, '0', {from: carol});
            console.log('--> balanceOf(bob)=%s', String(await this.yax.balanceOf(bob)).valueOf());
            console.log('--> balanceOf(carol)=%s', String(await this.yax.balanceOf(carol)).valueOf());
            console.log('--> balanceOf(tresury)=%s', String(await this.yax.balanceOf(tresury)).valueOf());
            console.log('--> totalSupply(YAX)=%s', String(await this.yax.totalSupply().valueOf()));
        }
    });

    it('test should update totalAllocPoint only after pool started', async () => {
        this.chef = await YaxisChef.new(this.yax.address, tresury, '1', '300', {from: alice});
        await this.yax.addMinter(this.chef.address, {from: alice});
        this.lp = await MockERC20.new('LPToken', 'LP', '10000000000', {from: minter});
        await this.lp.transfer(alice, '1000', {from: minter});
        await this.lp.transfer(bob, '1000', {from: minter});
        await this.lp.transfer(carol, '1000', {from: minter});
        await this.lp.approve(this.chef.address, '1000', {from: bob});
        await this.lp.approve(this.chef.address, '1000', {from: carol});
        this.lp2 = await MockERC20.new('LPToken2', 'LP2', '10000000000', {from: minter});
        await this.lp2.transfer(alice, '1000', {from: minter});
        await this.lp2.transfer(bob, '1000', {from: minter});
        await this.lp2.transfer(carol, '1000', {from: minter});
        await this.lp2.approve(this.chef.address, '1000', {from: bob});
        await this.lp2.approve(this.chef.address, '1000', {from: carol});
        this.lp3 = await MockERC20.new('LPToken3', 'LP3', '10000000000', {from: minter});
        await this.lp3.transfer(alice, '1000', {from: minter});
        await this.lp3.transfer(bob, '1000', {from: minter});
        await this.lp3.transfer(carol, '1000', {from: minter});
        await this.lp3.approve(this.chef.address, '1000', {from: bob});
        await this.lp3.approve(this.chef.address, '1000', {from: carol});
        await this.chef.add('100', this.lp.address, true, 200);
        await this.chef.add('100', this.lp2.address, true, 400);
        await this.chef.deposit(0, '100', {from: bob});
        await this.chef.deposit(1, '100', {from: carol});
        assert.equal((await this.yax.balanceOf(bob)).valueOf(), '0');
        assert.equal((await this.yax.balanceOf(carol)).valueOf(), '0');
        for (let i = 1; i <= 15; i++) {
            console.log('block: %d', 100 + i * 50);
            await time.advanceBlockTo(100 + i * 50);
            await this.chef.deposit(0, '0', {from: bob});
            await this.chef.deposit(1, '0', {from: carol});
            if (i == 4) {
                // update pool
                console.log('--> UPDATE POOL 2');
                await this.chef.set(1, '50', true);
            }
            if (i == 5) {
                // open another late pool
                console.log('--> OPEN POOL 3');
                await this.chef.add('1000', this.lp3.address, true, 450);
                await this.chef.deposit(2, '100', {from: carol});
                console.log('--> UPDATE POOL 1');
                await this.chef.set(0, '0', true);
            }
            if (i > 5) await this.chef.deposit(2, '0', {from: carol});
            console.log('--> totalAllocPoint=%s', String(await this.chef.totalAllocPoint()).valueOf());
            // console.log('--> pool[0]=%s', JSON.stringify(await this.chef.poolInfo(0)));
            // console.log('--> pool[1]=%s', JSON.stringify(await this.chef.poolInfo(1)));
            console.log('--> balanceOf(bob)=%s', String(await this.yax.balanceOf(bob)).valueOf());
            console.log('--> balanceOf(carol)=%s', String(await this.yax.balanceOf(carol)).valueOf());
            console.log('--> balanceOf(tresury)=%s', String(await this.yax.balanceOf(tresury)).valueOf());
            console.log('--> totalSupply(YAX)=%s', String(await this.yax.totalSupply().valueOf()));
        }
    });
});
