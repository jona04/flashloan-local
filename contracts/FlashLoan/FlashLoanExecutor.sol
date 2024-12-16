// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

interface IFlashLoanLender {
    function flashLoan(address borrower, address token, uint256 amount, bytes calldata data) external;
}

interface ISimpleDEX {
    function swapAForB(uint256 amount) external returns (uint256);
    function swapBForA(uint256 amount) external returns (uint256);
    function reserveA() external view returns (uint256);
    function reserveB() external view returns (uint256);
}

contract FlashLoanExecutor {
    address public owner;

    // Evento para monitorar execuções
    event FlashLoanExecuted(address token, uint256 amount, uint256 fee, uint256 profit);
    event ProfitsWithdrawn(address owner, address token, uint256 balance);

    uint8 tokenDecimals = 18; // Geralmente 18 para ERC20

    constructor() {
        owner = msg.sender;
    }

    // Modificador para restringir funções ao proprietário
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }

    function initiateFlashLoan(
        address lender,
        address token,
        uint256 amount,
        address[] calldata dexes,
        address targetToken
    ) external onlyOwner {
        // Dados adicionais que podem ser passados para a lógica do empréstimo
        bytes memory data = abi.encode(token, amount, dexes, targetToken);

        console.log("Iniciando flash loan...");
        console.log("Lender:", lender);
        console.log("Token:", token);
        console.log("Amount:", formatTokenAmount(amount, tokenDecimals));
        console.log("Target Token:", targetToken);

        // Solicita o empréstimo flash ao FlashLoan Lender
        IFlashLoanLender(lender).flashLoan(address(this), token, amount, data);
    }

    // Função chamada pelo FlashLoan Lender durante o empréstimo flash
    function executeOperation(
        address token,
        uint256 amount,
        uint256 fee,
        bytes calldata data
    ) external {
        console.log("Parametros recebidos:");
        console.log("Token:", token);
        console.log("Amount:", formatTokenAmount(amount,tokenDecimals));
        console.log("Fee:", formatTokenAmount(fee, tokenDecimals));

        // Decodificar os dados adicionais passados no empréstimo
        (address tokenA, uint256 loanAmount, address[] memory dexes, address targetToken) = abi.decode(data, (address, uint256, address[], address));

        // Validar os parâmetros
        require(tokenA == token, "Token nao corresponde ao emprestado");
        require(loanAmount == amount, "Quantidade emprestada invalida");

        // Verificar saldo inicial do contrato
        uint256 initialBalance = IERC20(token).balanceOf(address(this));
        console.log("Saldo inicial do contrato:", formatTokenAmount(initialBalance,tokenDecimals));

        // Lógica de arbitragem: usar as DEXs fornecidas para trocar tokens e obter lucro
        uint256 profit = performArbitrage(token, amount, dexes, targetToken);

        // Calcular o total necessário para devolver o empréstimo
        uint256 totalRepayment = amount + fee;
        console.log("Total necessario para devolucao:", formatTokenAmount(totalRepayment,tokenDecimals));

        // Garantir que o contrato tem fundos suficientes para devolver o empréstimo
        uint256 finalBalance = IERC20(token).balanceOf(address(this));
        console.log("Saldo final do contrato:", formatTokenAmount(finalBalance, tokenDecimals));
        require(finalBalance >= totalRepayment, "Saldo insuficiente para devolucao do emprestimo");

        IERC20(token).approve(msg.sender, totalRepayment);
        uint256 allowance = IERC20(token).allowance(address(this), msg.sender);
        require(allowance >= totalRepayment, "Allowance insuficiente para simular lucro");

        uint256 currentBalance = IERC20(token).balanceOf(address(this));
        console.log("Saldo atual do contrato antes da devolucao:", formatTokenAmount(currentBalance, tokenDecimals));
        require(currentBalance >= totalRepayment, "Saldo insuficiente para devolucao do emprestimo");

        IERC20(token).transfer(msg.sender, totalRepayment);
        console.log("Transferencia para o Lender concluida.");

        // Calcular o lucro líquido
        uint256 netProfit = profit > fee ? profit - fee : 0;
        console.log("Lucro liquido calculado:", formatTokenAmount(netProfit,tokenDecimals));

        // Garante que o lucro líquido é maior que zero antes de tentar transferir
        require(netProfit > 0, "Lucro liquido insuficiente para transferencia");

        // Tenta transferir o lucro líquido para o proprietário
        bool success = IERC20(token).transfer(owner, netProfit);
        require(success, "Transferencia de lucro liquido para o proprietario falhou");
        
        emit FlashLoanExecuted(token, amount, fee, profit);
    }

    function performArbitrage(
        address token,
        uint256 amount,
        address[] memory dexes,
        address targetToken
    ) internal returns (uint256) {
        console.log("Saldo inicial do contrato antes da arbitragem:", formatTokenAmount(IERC20(token).balanceOf(address(this)),tokenDecimals));
        console.log("Valor a ser enviado para token B: ", formatTokenAmount(amount,tokenDecimals));

        require(dexes.length == 2, "Exatamente duas DEXs devem ser fornecidas");

        // Instâncias das DEXs
        ISimpleDEX dex1 = ISimpleDEX(dexes[0]);
        ISimpleDEX dex2 = ISimpleDEX(dexes[1]);

        // Aprovar a DEX1 para gastar os tokens do contrato
        require(IERC20(token).approve(address(dex1), amount), "Falha ao aprovar DEX1");
        
        uint256 contractBalance = IERC20(token).balanceOf(address(this));
        console.log("Saldo atual de TokenA no contrato:", contractBalance);
        require(contractBalance >= amount, "Saldo insuficiente para realizar o swap");

        console.log("Iniciando swap na DEX1...");
        uint256 tokenBReceived = dex1.swapAForB(amount);
        console.log("Quantidade de TokenB recebida da DEX1:", formatTokenAmount(tokenBReceived,tokenDecimals));

        // Aprovar a DEX2 para gastar os tokens recebidos
        require(IERC20(targetToken).approve(address(dex2), tokenBReceived), "Falha ao aprovar DEX2");

        console.log("Iniciando swap na DEX2...");
        uint256 tokenAReturned = dex2.swapBForA(tokenBReceived);
        console.log("Quantidade de TokenA retornada pela DEX2:", formatTokenAmount(tokenAReturned, tokenDecimals));

        // Calcular o lucro (diferença entre o que retornou e o que foi emprestado)
        require(tokenAReturned > amount, "Arbitragem nao foi lucrativa");
        uint256 profit = tokenAReturned - amount;
        console.log("Lucro obtido na arbitragem:", formatTokenAmount(profit,tokenDecimals));

        return profit;
    }


    function withdrawProfits(address token) external {
        require(msg.sender == owner, "Not authorized");
        uint256 balance = IERC20(token).balanceOf(address(this));
        require(balance > 0, "No profits to withdraw");

        console.log("Retirando lucros. Saldo:", balance);

        IERC20(token).transfer(owner, balance);
        emit ProfitsWithdrawn(owner, token, balance);
    }

    // Função auxiliar para formatar valores para legibilidade
    function formatTokenAmount(uint256 amount, uint8 decimals) internal pure returns (string memory) {
        uint256 integerPart = amount / (10**decimals);
        uint256 fractionalPart = amount % (10**decimals);
        return string(abi.encodePacked(
            uintToString(integerPart), 
            ".", 
            uintToString(fractionalPart / (10**(decimals - 2))) // Mostrando 2 casas decimais
        ));
    }

    // Função auxiliar para converter uint256 para string
    function uintToString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
