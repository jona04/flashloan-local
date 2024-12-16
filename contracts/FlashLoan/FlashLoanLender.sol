// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract FlashLoanLender {
    // Evento para empréstimos flash
    event FlashLoanExecuted(address borrower, address token, uint256 amount, uint256 fee);

    // Mapeamento do pool de liquidez para cada token
    mapping(address => uint256) public liquidityPools;

    // Taxa do empréstimo flash (em base 10000, ou seja, 9 = 0.09%)
    uint256 public constant FLASH_LOAN_FEE_BPS = 9;

    // Depósito de tokens no pool de liquidez
    function deposit(address token, uint256 amount) external {
        require(amount > 0, "Deposit amount must be greater than zero");
        IERC20(token).transferFrom(msg.sender, address(this), amount);
        liquidityPools[token] += amount;
    }

    // Retirada de tokens do pool de liquidez
    function withdraw(address token, uint256 amount) external {
        require(liquidityPools[token] >= amount, "Not enough liquidity");
        liquidityPools[token] -= amount;
        IERC20(token).transfer(msg.sender, amount);
    }

    // Empréstimo flash
    function flashLoan(address borrower, address token, uint256 amount, bytes calldata data) external {
        uint256 availableLiquidity = liquidityPools[token];
        require(availableLiquidity >= amount, "Not enough liquidity");

        // Calcula a taxa do empréstimo
        uint256 fee = (amount * FLASH_LOAN_FEE_BPS) / 10000;

        // Atualiza o pool temporariamente
        liquidityPools[token] -= amount;
        IERC20(token).transfer(borrower, amount);

        // Chama o contrato Executor para executar a lógica do empréstimo
        (bool success, ) = borrower.call(
            abi.encodeWithSignature("executeOperation(address,uint256,uint256,bytes)", token, amount, fee, data)
        );
        require(success, "Flash loan execution failed");

        // Verifica se o empréstimo foi devolvido
        uint256 totalRepayment = amount + fee;
        require(IERC20(token).balanceOf(address(this)) >= liquidityPools[token] + totalRepayment, "Repayment failed");

        // Atualiza o pool com os valores devolvidos
        liquidityPools[token] += fee;

        emit FlashLoanExecuted(borrower, token, amount, fee);
    }
}
