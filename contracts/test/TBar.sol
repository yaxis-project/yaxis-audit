pragma solidity 0.6.12;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/math/SafeMath.sol";

// Simplified YaxisBar version for testing
contract TBar is ERC20("Test Bar", "tBAR"){
    using SafeMath for uint;

    IERC20 public yax;

    address public governance;

    uint public constant BLOCKS_PER_WEEK = 10;

    // Block number when each epoch ends.
    uint[6] public epEndBlks;

    // Reward rate for each of 5 epoches:
    uint[6] public epRwdPerBlks = [1000, 800, 600, 400, 200, 0];

    uint[6] public accReleasedRwds;

    // Define the Yaxis token contract
    constructor(IERC20 _yax, uint _startBlock) public {
        require(block.number < _startBlock, "passed _startBlock");
        yax = _yax;
        epEndBlks[0] = _startBlock;
        epEndBlks[1] = epEndBlks[0] + BLOCKS_PER_WEEK * 2; // weeks 1-2
        epEndBlks[2] = epEndBlks[1] + BLOCKS_PER_WEEK * 2; // weeks 3-4
        epEndBlks[3] = epEndBlks[2] + BLOCKS_PER_WEEK * 4; // month 2
        epEndBlks[4] = epEndBlks[3] + BLOCKS_PER_WEEK * 8; // month 3-4
        epEndBlks[5] = epEndBlks[4] + BLOCKS_PER_WEEK * 8; // month 5-6
        accReleasedRwds[0] = 0;
        for (uint8 _epid = 1; _epid < 6; ++_epid) {
            // a[i] = (eb[i] - eb[i-1]) * r[i-1] + a[i-1]
            accReleasedRwds[_epid] = epEndBlks[_epid].sub(epEndBlks[_epid - 1]).mul(epRwdPerBlks[_epid - 1]).add(accReleasedRwds[_epid - 1]);
        }
        governance = msg.sender;
    }

    function setGovernance(address _governance) public {
        require(msg.sender == governance, "!governance");
        governance = _governance;
    }

    function releasedRewards() public view returns (uint) {
        uint _block = block.number;
        if (_block >= epEndBlks[5]) return accReleasedRwds[5];
        for (uint8 _epid = 5; _epid >= 1; --_epid) {
            if (_block >= epEndBlks[_epid - 1]) {
                return _block.sub(epEndBlks[_epid - 1]).mul(epRwdPerBlks[_epid - 1]).add(accReleasedRwds[_epid - 1]);
            }
        }
        return 0;
    }

    // @dev Return balance (deposited YAX + MV earning + any external yeild) plus released rewards
    // Read YIP-03, YIP-04 and YIP-05 for more details.
    function availableBalance() public view returns (uint) {
        return yax.balanceOf(address(this)).add(releasedRewards()).sub(accReleasedRwds[5]);
    }

    // Enter the bar. Pay some YAXs. Earn some shares.
    // Locks Yaxis and mints sYAX
    function enter(uint _amount) public {
        require(_amount > 0, "!_amount");

        // Gets the amount of available YAX locked in the contract
        uint _totalYaxis = availableBalance();

        // Gets the amount of sYAX in existence
        uint _totalShares = totalSupply();

        if (_totalShares == 0 || _totalYaxis == 0) { // If no sYAX exists, mint it 1:1 to the amount put in
            _mint(msg.sender, _amount);
        }
        else { // Calculate and mint the amount of sYAX the YAX is worth. The ratio will change overtime, as sYAX is burned/minted and YAX deposited + gained from fees / withdrawn.
            uint what = _amount.mul(_totalShares).div(_totalYaxis);
            _mint(msg.sender, what);
        }

        // Lock the YAX in the contract
        yax.transferFrom(msg.sender, address(this), _amount);
    }

    // Leave the bar. Claim back your YAX.
    // Unlocks the staked + gained YAX and burns sYAX
    function leave(uint _share) public {
        require(_share > 0, "!_share");

        // Gets the amount of available YAX locked in the contract
        uint _totalYaxis = availableBalance();

        // Gets the amount of sYAX in existence
        uint _totalShares = totalSupply();

        // Calculates the amount of YAX the sYAX is worth
        uint what = _share.mul(_totalYaxis).div(_totalShares);

        _burn(msg.sender, _share);
        yax.transfer(msg.sender, what);
    }

    // @dev Burn all sYAX you have and get back YAX.
    function exit() public {
        leave(balanceOf(msg.sender));
    }

    // @dev price of 1 sYAX over YAX (should increase gradiently over time)
    function getPricePerFullShare() external view returns (uint) {
        uint _ts = totalSupply();
        return (_ts == 0) ? 1e18 : availableBalance().mul(1e18).div(_ts);
    }

    // This function allows governance to take unsupported tokens (non-core) out of the contract. This is in an effort to make someone whole, should they seriously mess up.
    // There is no guarantee governance will vote to return these. It also allows for removal of airdropped tokens.
    function governanceRecoverUnsupported(IERC20 _token, uint256 _amount, address _to) external {
        require(msg.sender == governance, "!governance");
        require(address(_token) != address(yax), "YAX");
        require(address(_token) != address(this), "sYAX");
        _token.transfer(_to, _amount);
    }
}
