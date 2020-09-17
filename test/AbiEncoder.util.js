const ethers = require('ethers');

function encodeParameters(types, values) {
    const abi = new ethers.utils.AbiCoder();
    return abi.encode(types, values);
}

const yETH_WETH_LP_address = '0x9999999999999999999999999999999999999999';
const LP3 = '0xfE33fF7A5f99C8D3C5a8740E5Cfc241783584063';

contract('AbiEncoder.util', ([alice]) => {
    it('add yETH/WETH', async () => {
        console.log(encodeParameters(['uint256', 'address', 'bool', 'uint256'], ['1000', yETH_WETH_LP_address, false, 0]));
    });

    it('add yETH/WETH', async () => {
        console.log(encodeParameters(['uint256', 'address', 'bool', 'uint256'], ['10000', LP3, false, 20983000]));
    });
});
