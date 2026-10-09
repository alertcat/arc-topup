// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ArcTopUp - settlement receipts for USDC top-ups on Arc mainnet
/// @notice Arc uses USDC as its native gas token, so a payment is a plain value
///         transfer. Every payment is forwarded to the treasury inside the same
///         transaction and recorded as a Paid event that the off-chain crediting
///         service consumes. The contract never holds funds.
contract ArcTopUp {
    address public owner;
    address payable public treasury;
    uint256 public totalPaid;    // native USDC, 18-decimal wei
    uint256 public totalOrders;

    event Paid(bytes32 indexed orderId, address indexed payer, uint256 amount, uint256 index);
    event TreasuryChanged(address indexed previous, address indexed current);
    event OwnerChanged(address indexed previous, address indexed current);

    error ZeroValue();
    error ForwardFailed();
    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address payable treasury_) {
        if (treasury_ == address(0)) revert ZeroAddress();
        owner = msg.sender;
        treasury = treasury_;
    }

    /// @notice Pay for a specific order. orderId = sha256(order reference), chosen off-chain.
    function pay(bytes32 orderId) external payable {
        _settle(orderId);
    }

    /// @notice Plain transfers (wallet "send", EIP-681 QR codes) are accepted too.
    ///         They carry no orderId and are matched off-chain by their uniquely
    ///         tagged amount.
    receive() external payable {
        _settle(bytes32(0));
    }

    function _settle(bytes32 orderId) internal {
        if (msg.value == 0) revert ZeroValue();
        totalPaid += msg.value;
        uint256 index = ++totalOrders;
        (bool ok, ) = treasury.call{value: msg.value}("");
        if (!ok) revert ForwardFailed();
        emit Paid(orderId, msg.sender, msg.value, index);
    }

    function setTreasury(address payable treasury_) external onlyOwner {
        if (treasury_ == address(0)) revert ZeroAddress();
        emit TreasuryChanged(treasury, treasury_);
        treasury = treasury_;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerChanged(owner, newOwner);
        owner = newOwner;
    }
}
