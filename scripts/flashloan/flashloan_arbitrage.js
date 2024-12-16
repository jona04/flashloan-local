const { ethers } = require("hardhat");

// Ajustar valores para decimais do token
async function adjustToDecimals(token, amount) {
    const decimals = await token.decimals();
    return ethers.parseUnits(amount.toString(), decimals);
}

// Reverter valores para exibição legível
async function revertFromDecimals(token, amount) {
    const decimals = await token.decimals();
    return ethers.formatUnits(amount, decimals);
}

// Função para calcular o spread
function calculateSpread(price1, price2) {
    return Math.abs(price1 - price2) / Math.min(price1, price2) * 100;
}

// Função para calcular o valor do swap
function getSwapAmount(inputAmount, inputReserve, outputReserve) {
    const inputAmountWithFee = inputAmount * 997; // 0.3% taxa de swap
    const numerator = inputAmountWithFee * outputReserve;
    const denominator = inputReserve * 1000 + inputAmountWithFee;
    return numerator / denominator;
}

async function simulateFlashLoanArbitrage() {
    const [deployer] = await ethers.getSigners();

    console.log("Deployer address:", deployer.address);

    const flashLoanLenderAddress = "0x610178dA211FEF7D417bC0e6FeD39F05609AD788";
    const flashLoanExecutorAddress = "0x0B306BF915C4d645ff596e518fAf3F9669b97016";
    const tokenAAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const tokenBAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    const dex1Address = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    const dex2Address = "0x0165878A594ca255338adfa4d48449f69242Eb8F";

    console.log("Configuração de endereços carregada...");

    const tokenAbi = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function balanceOf(address account) public view returns (uint256)",
        "function decimals() public view returns (uint8)"
    ];

    const dexAbi = [
        "function getSwapAmount(uint256 inputAmount, uint256 inputReserve, uint256 outputReserve) public pure returns (uint256)",
        "function reserveA() public view returns (uint256)",
        "function reserveB() public view returns (uint256)"
    ];

    const tokenA = new ethers.Contract(tokenAAddress, tokenAbi, deployer);
    const tokenB = new ethers.Contract(tokenBAddress, tokenAbi, deployer);

    console.log("Instâncias dos contratos de tokens criadas...");

    const loanAmount = 10000; // Valor do empréstimo
    const adjustedLoanAmount = await adjustToDecimals(tokenA, loanAmount);
    console.log("Valor ajustado para empréstimo:", adjustedLoanAmount.toString());

    console.log("Simulando arbitragem...");
    const dex1 = new ethers.Contract(dex1Address, dexAbi, deployer);
    const dex2 = new ethers.Contract(dex2Address, dexAbi, deployer);

    // Reservas das DEXs
    const reserveA1 = await dex1.reserveA();
    const reserveB1 = await dex1.reserveB();
    const reserveA2 = await dex2.reserveA();
    const reserveB2 = await dex2.reserveB();

    console.log("Reservas DEX1 - TokenA:", ethers.formatUnits(reserveA1, 18), "TokenB:", ethers.formatUnits(reserveB1, 18));
    console.log("Reservas DEX2 - TokenA:", ethers.formatUnits(reserveA2, 18), "TokenB:", ethers.formatUnits(reserveB2, 18));

    // Preços de TokenA -> TokenB
    const priceAtoB1 = Number(reserveB1) / Number(reserveA1);
    console.log("DEX 1 - Preço A->B:", priceAtoB1);

    const priceAtoB2 = Number(reserveB2) / Number(reserveA2);
    console.log("DEX 2 - Preço A->B:", priceAtoB2);

    const spread = calculateSpread(priceAtoB1, priceAtoB2);
    console.log(`Spread entre DEX: ${spread.toFixed(2)}%`);

    // Simulação do Swap na DEX1
    const tokenBReceived = BigInt(
        Math.floor(getSwapAmount(Number(adjustedLoanAmount), Number(reserveA1), Number(reserveB1)))
    );
    console.log("Quantidade de TokenB recebida da DEX1:", ethers.formatUnits(tokenBReceived.toString(), 18));

    const reserveA1AfterSwap = reserveA1 + adjustedLoanAmount;
    const reserveB1AfterSwap = reserveB1 - tokenBReceived;

    /// Simulação do Swap na DEX2
    const tokenAReturned = BigInt(
        Math.floor(getSwapAmount(Number(tokenBReceived), Number(reserveB2), Number(reserveA2)))
    );
    console.log("Quantidade de TokenA retornada pela DEX2:", ethers.formatUnits(tokenAReturned.toString(), 18));

    const reserveA2AfterSwap = reserveA2 - tokenAReturned;
    const reserveB2AfterSwap = reserveB2 + tokenBReceived;

    console.log("Reservas DEX1 após swap - TokenA:", ethers.formatUnits(reserveA1AfterSwap, 18), "TokenB:", ethers.formatUnits(reserveB1AfterSwap, 18));
    console.log("Reservas DEX2 após swap - TokenA:", ethers.formatUnits(reserveA2AfterSwap, 18), "TokenB:", ethers.formatUnits(reserveB2AfterSwap, 18));

    // Cálculo do lucro líquido
    const fee = adjustedLoanAmount / BigInt(1000); // 0.1% taxa de flash loan
    const netProfit = BigInt(Math.floor(Number(tokenAReturned - adjustedLoanAmount - fee)));

    console.log("Taxa do flash loan (fee):", ethers.formatUnits(fee.toString(), 18));
    console.log("Lucro líquido estimado:", ethers.formatUnits(netProfit.toString(), 18));


    if (netProfit <= 0) {
        console.log("Lucro líquido insuficiente para justificar o flash loan.");
        return;
    }

    // Aprovar tokens para o Executor
    const approveTx = await tokenA.approve(flashLoanExecutorAddress, ethers.parseUnits("1000000", 18)); // Valor arbitrário grande
    await approveTx.wait();
    console.log("Aprovação de tokens para o Executor realizada com sucesso.");

    console.log("Iniciando flash loan...");
    const executorAbi = [
        "function initiateFlashLoan(address lender, address token, uint256 amount, address[] dexes, address tokenB) external",
        "event FlashLoanExecuted(address token, uint256 amount, uint256 fee, uint256 profit)",
        "event ProfitsWithdrawn(address owner, address token, uint256 balance)"
    ];

    const executor = new ethers.Contract(flashLoanExecutorAddress, executorAbi, deployer);
    const tx = await executor.initiateFlashLoan(
        flashLoanLenderAddress,
        tokenAAddress,
        adjustedLoanAmount,
        [dex1Address, dex2Address],
        tokenBAddress
    );

    const receipt = await tx.wait();
    console.log("Flash loan executado. Hash da transação:", receipt.transactionHash);

    // Capturar eventos do contrato Executor
    const logs = receipt.logs.map((log) => {
        try {
            return executor.interface.parseLog(log);
        } catch (error) {
            return null;
        }
    });

    const flashLoanEvent = logs.find((log) => log && log.name === "FlashLoanExecuted");
    if (flashLoanEvent) {
        console.log("Flash Loan Executed Event Captured:");
        console.log(`Token: ${flashLoanEvent.args.token}`);
        console.log(`Amount: ${await revertFromDecimals(tokenA, flashLoanEvent.args.amount)}`);
        console.log(`Fee: ${await revertFromDecimals(tokenA, flashLoanEvent.args.fee)}`);
        console.log(`Profit: ${await revertFromDecimals(tokenA, flashLoanEvent.args.profit)}`);
    } else {
        console.log("Nenhum evento FlashLoanExecuted encontrado.");
    }
}

simulateFlashLoanArbitrage()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erro ao executar o script:", error);
        process.exit(1);
    });
