const { ethers } = require("hardhat");

// Função para ajustar valores para decimais
async function adjustToDecimals(token, amount) {
    const decimals = await token.decimals();
    return ethers.parseUnits(amount.toString(), decimals);
}

// Função para converter valores ajustados de volta para uma escala legível
async function revertFromDecimals(token, amount) {
    const decimals = await token.decimals();
    return ethers.formatUnits(amount, decimals);
}

// Função para calcular custo de gás
async function calculateGasCost(receipt, gasPrice) {
    const gasUsed = BigInt(receipt.gasUsed.toString());
    const totalCost = gasUsed * BigInt(gasPrice.toString());
    return ethers.formatUnits(totalCost, "ether"); // Retorna em ETH
}

// Função para calcular o spread
function calculateSpread(price1, price2) {
    return Math.abs(price1 - price2) / Math.min(price1, price2) * 100;
}

async function simulateArbitrage() {
    const [deployer] = await ethers.getSigners();

    // Endereços dos contratos
    const tokenAAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";
    const tokenBAddress = "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512";
    // const tokenCAddress = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    // const tokenDAddress = "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9";
    // const tokenEAddress = "0xDc64a140Aa3E981100a9becA4E685f962f0cF6C9";
    // const tokenFAddress = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707";

    const dex1Address = "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0";
    const dex2Address = "0x0165878A594ca255338adfa4d48449f69242Eb8F";
    // const dex3Address = "0x9A676e781A523b5d0C0e43731313A708CB607508";
    // const dex4Address = "0x9A676e781A523b5d0C0e43731313A708CB607508";
    // const dex5Address = "0x68B1D87F95878fE05B998F19b66F4baba5De1aed";
    // const dex6Address = "0x4ed7c70F96B99c776995fB64377f0d4aB3B0e1C1";

    const tokenAbi = [
        "function approve(address spender, uint256 amount) public returns (bool)",
        "function balanceOf(address account) public view returns (uint256)",
        "function decimals() public view returns (uint8)",
        "function allowance(address owner, address spender) public view returns (uint256)"
    ];

    const dexAbi = [
        "function swapAForB(uint256 amount) public",
        "function swapBForA(uint256 amount) public",
        "function reserveA() public view returns (uint256)",
        "function reserveB() public view returns (uint256)",
        "event SwapAForB(address indexed user, uint256 amountA, uint256 amountB)",
        "event SwapBForA(address indexed user, uint256 amountB, uint256 amountA)"
    ];

    const tokenA = new ethers.Contract(tokenAAddress, tokenAbi, deployer);
    const tokenB = new ethers.Contract(tokenBAddress, tokenAbi, deployer);

    const dex1 = new ethers.Contract(dex1Address, dexAbi, deployer);
    const dex2 = new ethers.Contract(dex2Address, dexAbi, deployer);
    // const dex3 = new ethers.Contract(dex3Address, dexAbi, deployer);
    // const dex4 = new ethers.Contract(dex4Address, dexAbi, deployer);
    // const dex5 = new ethers.Contract(dex5Address, dexAbi, deployer);
    // const dex6 = new ethers.Contract(dex6Address, dexAbi, deployer);

    const dexContracts = [dex1, dex2]; // , dex3, dex4, dex5, dex6];

    // Captura o saldo inicial de Token A
    const initialBalanceA = await tokenA.balanceOf(deployer.address);
    console.log("Saldo inicial de Token A:", await revertFromDecimals(tokenA, initialBalanceA));

    const amountA = 100000; // Quantidade legível de Token A para arbitragem
    const adjustedAmountA = await adjustToDecimals(tokenA, amountA);

    console.log(`Amount a = ${amountA}. Valor ajustado = ${adjustedAmountA}`);
    console.log("Iniciando arbitragem...");

    // Capturando preços e spreads entre todas as DEXs
    const spreads = [];
    for (let i = 0; i < dexContracts.length; i++) {
        for (let j = i+1; i < dexContracts.length; i++) {
            const dex1 = dexContracts[i];
            const dex2 = dexContracts[j];

            const reserveA1 = BigInt(await dex1.reserveA());
            const reserveB1 = BigInt(await dex1.reserveB());
            const priceAtoB1 = Number(reserveB1) / Number(reserveA1);

            const reserveA2 = BigInt(await dex2.reserveA());
            const reserveB2 = BigInt(await dex2.reserveB());
            const priceAtoB2 = Number(reserveB2) / Number(reserveA2);
            
            console.log(`Preço A->B no DEX ${i}:, ${priceAtoB1.toFixed(6)}`);
            console.log(`Preço A->B no DEX ${j}:, ${priceAtoB2.toFixed(6)}`);

            const spread = calculateSpread(priceAtoB1, priceAtoB2);
            spreads.push({ dex1: i, dex2: j, spread, priceAtoB1, priceAtoB2 });

            console.log(`Spread entre DEX ${i} e ${j}: ${spread.toFixed(2)}%`);
        }
    }

    // Selecionar o maior spread
    const bestSpread = spreads.reduce((max, current) => (current.spread > max.spread ? current : max), spreads[0]);
    console.log("\nMelhor spread encontrado:", bestSpread);

    const bestDex1 = dexContracts[bestSpread.dex1];
    const bestDex2 = dexContracts[bestSpread.dex2];

    console.log(`Executando arbitragem entre DEX ${bestSpread.dex1} e ${bestSpread.dex2}...`);

    // Capturar preço inicial e calcular spread
    const reserveA1 = BigInt(await bestDex1.reserveA());
    const reserveB1 = BigInt(await bestDex1.reserveB());
    const priceAtoB1 = Number(reserveB1) / Number(reserveA1);

    const reserveA2 = BigInt(await bestDex2.reserveA());
    const reserveB2 = BigInt(await bestDex2.reserveB());
    const priceAtoB2 = Number(reserveB2) / Number(reserveA2);

    console.log("\nPreço A->B no DEX :",bestSpread.dex1, priceAtoB1.toFixed(6));
    console.log("Preço A->B no DEX :",bestSpread.dex2, priceAtoB2.toFixed(6));

    const spread = Math.abs(priceAtoB1 - priceAtoB2) / Math.min(priceAtoB1, priceAtoB2) * 100;
    console.log("Spread calculado:", spread.toFixed(2), "%");

    if (spread < 1) {
        console.log("Spread insuficiente para arbitragem.");
        return;
    }

    // Etapa 1: Comprar Token B no DEX 1
    console.log("Comprando Token B no DEX 1...");
    const gasPrice = (await ethers.provider.getFeeData()).gasPrice;
    await tokenA.approve(await bestDex1.getAddress(), adjustedAmountA);
    // const allowance = await tokenA.allowance(deployer.address, dex1Address);
    // console.log(`Allowance para o DEX ${dex1Address}: ${await revertFromDecimals(tokenA, allowance)}`);
    const tx1 = await bestDex1.swapAForB(adjustedAmountA);
    const receipt1 = await tx1.wait();

    const gasCost1 = await calculateGasCost(receipt1, gasPrice);
    console.log("Custo de gás no DEX 1:", gasCost1, "ETH");

    // Capturar saldo de Token B após compra
    const balanceB = await tokenB.balanceOf(deployer.address);
    console.log("Saldo de Token B após compra no DEX 1:", await revertFromDecimals(tokenB, balanceB));

    // Capturar valor adquirido de Token B
    const logs1 = receipt1.logs.map(log => {
        try {
            return dex4.interface.parseLog(log);
        } catch (e) {
            return null;
        }
    });

    const swapEvent1 = logs1.find(log => log && log.name === "SwapAForB");
    if (!swapEvent1) {
        throw new Error("Evento SwapAForB não encontrado no DEX 1.");
    }
    const acquiredB = swapEvent1.args.amountB; // Token B adquirido no DEX 1
    console.log("Token B adquirido no DEX 1:", await revertFromDecimals(tokenB, acquiredB));

    // Etapa 2: Vender Token B no DEX 2
    const maxAmountB = reserveB2 / 2n; // Limite de 50% das reservas do DEX 2
    const adjustedAcquiredB = BigInt(acquiredB) > maxAmountB ? maxAmountB : BigInt(acquiredB);

    console.log("Vendendo Token B no DEX 2...");
    await tokenB.approve(await bestDex2.getAddress(), adjustedAcquiredB);
    const tx2 = await bestDex2.swapBForA(adjustedAcquiredB);
    const receipt2 = await tx2.wait();

    const gasCost2 = await calculateGasCost(receipt2, gasPrice);
    console.log("Custo de gás no DEX 2:", gasCost2, "ETH");

    // Verificar saldo final de Token A
    const finalBalanceA = await tokenA.balanceOf(deployer.address);
    console.log("Saldo final de Token A:", await revertFromDecimals(tokenA, finalBalanceA));

    // Calculando lucro e custo total
    const profitA = finalBalanceA - initialBalanceA; // Lucro bruto em Token A
    const totalGasCost = parseFloat(gasCost1) + parseFloat(gasCost2); // Custo total de gás em ETH
    console.log("Lucro bruto de Token A:", await revertFromDecimals(tokenA, profitA));
    console.log("Custo total de gás (ETH):", totalGasCost.toFixed(18));
    console.log(
        "Lucro líquido de Token A:",
        await revertFromDecimals(tokenA, profitA - ethers.parseUnits(totalGasCost.toFixed(18), "ether"))
    );
}

simulateArbitrage()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error("Erro ao executar o script:", error);
        process.exit(1);
    });
