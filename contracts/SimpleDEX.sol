// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract SimpleDEX {
    IERC20 public tokenA;
    IERC20 public tokenB;
    uint256 public reserveA;
    uint256 public reserveB;

    event LiquidityAdded(address indexed provider, uint256 amountA, uint256 amountB);
    event SwapAForB(address indexed user, uint256 amountA, uint256 amountB);
    event SwapBForA(address indexed user, uint256 amountB, uint256 amountA);
    event DebugSwap(address user, uint256 inputAmount, uint256 outputAmount, uint256 reserveA, uint256 reserveB);

    constructor(address _tokenA, address _tokenB) {
        tokenA = IERC20(_tokenA);
        tokenB = IERC20(_tokenB);
    }

    function addLiquidity(uint256 amountA, uint256 amountB) external {
        require(amountA > 0 && amountB > 0, "Invalid amounts");

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transferFrom(msg.sender, address(this), amountB);

        reserveA += amountA;
        reserveB += amountB;

        emit LiquidityAdded(msg.sender, amountA, amountB);
    }

    function swapAForB(uint256 amountA) external returns (uint256) {
        uint256 amountB = getSwapAmount(amountA, reserveA, reserveB);
        require(amountB > 0, "Insufficient output amount");
        require(amountB <= reserveB, "Insufficient liquidity");

        tokenA.transferFrom(msg.sender, address(this), amountA);
        tokenB.transfer(msg.sender, amountB);

        reserveA += amountA;
        reserveB -= amountB;

        emit SwapAForB(msg.sender, amountA, amountB);
        emit DebugSwap(msg.sender, amountA, amountB, reserveA, reserveB); // Novo log para debug

        return amountB; // Retorna a quantidade de TokenB recebida
    }

    function swapBForA(uint256 amountB) external returns (uint256) {
        require(amountB > 0, "Invalid amount");
        require(amountB <= reserveB / 2, "Amount too large"); // Limite de entrada

        uint256 amountA = getSwapAmount(amountB, reserveB, reserveA);
        require(amountA > 0 && amountA <= reserveA, "Insufficient liquidity");

        tokenB.transferFrom(msg.sender, address(this), amountB);
        tokenA.transfer(msg.sender, amountA);

        reserveB += amountB;
        reserveA -= amountA;

        emit SwapBForA(msg.sender, amountB, amountA);

        return amountA; // Retorna a quantidade de TokenA recebida
    }



    function getSwapAmount(uint256 inputAmount, uint256 inputReserve, uint256 outputReserve) public pure returns (uint256) {
        require(inputReserve > 0 && outputReserve > 0, "Invalid reserves");

        uint256 inputAmountWithFee = inputAmount * 997; // Taxa de 0.3%
        return (inputAmountWithFee * outputReserve) / (inputReserve * 1000 + inputAmountWithFee);
    }
}
