const {expectRevert} = require('@openzeppelin/test-helpers');
const YaxisToken = artifacts.require('YaxisToken');

contract('YaxisToken', ([alice, bob, carol]) => {
    beforeEach(async () => {
        this.yax = await YaxisToken.new(1000000, {from: alice});
    });

    it('should have correct name and symbol and decimal', async () => {
        const name = await this.yax.name();
        const symbol = await this.yax.symbol();
        const decimals = await this.yax.decimals();
        const cap = await this.yax.cap();
        assert.equal(name.valueOf(), 'yAxis');
        assert.equal(symbol.valueOf(), 'YAX');
        assert.equal(decimals.valueOf(), '18');
        assert.equal(cap.valueOf(), '1000000');
    });

    it('should only allow governance or minter to mint token', async () => {
        await this.yax.mint(alice, '100', {from: alice});
        await this.yax.addMinter(carol, {from: alice});
        await this.yax.mint(bob, '1000', {from: carol});
        await expectRevert(
            this.yax.mint(carol, '1000', {from: bob}),
            '!governance && !minter -- Reason given: !governance && !minter',
        );
        await this.yax.burn('500', {from: bob});
        const totalSupply = await this.yax.totalSupply();
        const aliceBal = await this.yax.balanceOf(alice);
        const bobBal = await this.yax.balanceOf(bob);
        const carolBal = await this.yax.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '600');
        assert.equal(aliceBal.valueOf(), '100');
        assert.equal(bobBal.valueOf(), '500');
        assert.equal(carolBal.valueOf(), '0');
    });

    it('should supply token transfers properly', async () => {
        await this.yax.mint(alice, '100', {from: alice});
        await this.yax.mint(bob, '1000', {from: alice});
        await this.yax.transfer(carol, '10', {from: alice});
        await this.yax.transfer(carol, '100', {from: bob});
        const totalSupply = await this.yax.totalSupply();
        const aliceBal = await this.yax.balanceOf(alice);
        const bobBal = await this.yax.balanceOf(bob);
        const carolBal = await this.yax.balanceOf(carol);
        assert.equal(totalSupply.valueOf(), '1100');
        assert.equal(aliceBal.valueOf(), '90');
        assert.equal(bobBal.valueOf(), '900');
        assert.equal(carolBal.valueOf(), '110');
    });

    it('should fail if you try to do bad transfers', async () => {
        await this.yax.mint(alice, '100', {from: alice});
        await expectRevert(
            this.yax.transfer(carol, '110', {from: alice}),
            'ERC20: transfer amount exceeds balance',
        );
        await expectRevert(
            this.yax.transfer(carol, '1', {from: bob}),
            'ERC20: transfer amount exceeds balance',
        );
    });

    it('should fail if you mint more than cap', async () => {
        await expectRevert(
            this.yax.mint(carol, '1000001', {from: alice}),
            'ERC20Capped: cap exceeded',
        );
        await this.yax.mint(alice, '1000000', {from: alice});
    });

    it('should fail if you set cap less than supply', async () => {
        await this.yax.mint(alice, '1000', {from: alice});
        await expectRevert(
            this.yax.setCap('999', {from: alice}),
            '_cap is below current total supply',
        );
        this.yax.setCap('2000', {from: alice});
    });
});
