const {expectRevert, time} = require('@openzeppelin/test-helpers');
const ethers = require('ethers');
const YaxisToken = artifacts.require('YaxisToken');
const YaxisChef = artifacts.require('YaxisChef');
const MockERC20 = artifacts.require('MockERC20');
const Timelock = artifacts.require('Timelock');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

contract('Timelock', ([alice, bob, carol, tresury, minter]) => {
    beforeEach(async () => {
        this.yax = await YaxisToken.new(1000000);
        this.timelock = await Timelock.new(bob, '86400');
    });

    it('should not allow non-owner to do operation', async () => {
        await this.yax.setGovernance(this.timelock.address, {from: alice});
        await expectRevert(
            this.yax.setGovernance(carol, {from: alice}),
            '!governance',
        );
        await expectRevert(
            this.yax.setGovernance(carol, {from: bob}),
            '!governance',
        );
        await expectRevert(
            this.timelock.queueTransaction(
                this.yax.address, '0', 'setGovernance(address)',
                encodeParameters(['address'], [carol]),
                (await time.latest()).add(time.duration.hours(24)),
                {from: alice},
            ),
            'Timelock::queueTransaction: Call must come from admin.',
        );
    });

    it('should do the timelock thing', async () => {
        await this.yax.setGovernance(this.timelock.address, {from: alice});
        const eta = (await time.latest()).add(time.duration.hours(24));
        await this.timelock.queueTransaction(
            this.yax.address, '0', 'setGovernance(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        await time.increase(time.duration.hours(5));
        await expectRevert(
            this.timelock.executeTransaction(
                this.yax.address, '0', 'setGovernance(address)',
                encodeParameters(['address'], [carol]), eta, {from: bob},
            ),
            "Timelock::executeTransaction: Transaction hasn't surpassed time lock.",
        );
        await time.increase(time.duration.hours(24));
        await this.timelock.executeTransaction(
            this.yax.address, '0', 'setGovernance(address)',
            encodeParameters(['address'], [carol]), eta, {from: bob},
        );
        assert.equal((await this.yax.governance()).valueOf(), carol);
    });

    it('should also work with YaxisChef', async () => {
        this.lp1 = await MockERC20.new('LPToken', 'LP', '10000000000', {from: minter});
        this.lp2 = await MockERC20.new('LPToken', 'LP', '10000000000', {from: minter});
        this.chef = await YaxisChef.new(this.yax.address, tresury, '1000', '0', {from: alice});
        await this.yax.setGovernance(this.chef.address, {from: alice});
        await this.chef.add('100', this.lp1.address, true, 0);
        await this.chef.transferOwnership(this.timelock.address, {from: alice});
        const eta = (await time.latest()).add(time.duration.hours(24));
        await this.timelock.queueTransaction(
            this.chef.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, {from: bob},
        );
        await this.timelock.queueTransaction(
            this.chef.address, '0', 'add(uint256,address,bool,uint256)',
            encodeParameters(['uint256', 'address', 'bool', 'uint256'], ['100', this.lp2.address, false, 0]), eta, {from: bob},
        );
        await time.increase(time.duration.hours(24));
        await this.timelock.executeTransaction(
            this.chef.address, '0', 'set(uint256,uint256,bool)',
            encodeParameters(['uint256', 'uint256', 'bool'], ['0', '200', false]), eta, {from: bob},
        );
        await this.timelock.executeTransaction(
            this.chef.address, '0', 'add(uint256,address,bool,uint256)',
            encodeParameters(['uint256', 'address', 'bool', 'uint256'], ['100', this.lp2.address, false, 0]), eta, {from: bob},
        );
        // console.log(encodeParameters(['uint256', 'address', 'bool', 'uint256'], ['100', this.lp2.address, false, 0]));
        assert.equal((await this.chef.poolInfo('0')).valueOf().allocPoint, '200');
        assert.equal((await this.chef.totalAllocPoint()).valueOf(), '300');
        assert.equal((await this.chef.poolLength()).valueOf(), '2');
    });
});
