async function main() {
    const [deployer] = await ethers.getSigners();

    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy dos tokens ERC20
    const MockERC20 = await ethers.getContractFactory("MockERC20");

    // Criando vários tokens
    const tokens = [];
    const tokenNames = ["Token A", "Token B"];
    const tokenSymbols = ["TKA", "TKB"];

    for (let i = 0; i < tokenNames.length; i++) {
        const token = await MockERC20.deploy(tokenNames[i], tokenSymbols[i], ethers.parseUnits("1000000", 18));
        await token.waitForDeployment();
        console.log(`${tokenNames[i]} deployed to:`, token.target);
        tokens.push(token);
    }

    // Deploy das DEXs
    const SimpleDEX = await ethers.getContractFactory("SimpleDEX");
    const dexes = [];
    const dexLiquidity = [
        // [TokenA, TokenB, LiquidezTokenA, LiquidezTokenB]
        [tokens[0], tokens[1], "950000000", "930000000"], // DEX 1
        [tokens[0], tokens[1], "990000000", "950000000"], // DEX 2
    ];

    for (let i = 0; i < dexLiquidity.length; i++) {
        const [tokenA, tokenB, liquidityA, liquidityB] = dexLiquidity[i];
        const dex = await SimpleDEX.deploy(tokenA.target, tokenB.target);
        await dex.waitForDeployment();
        console.log(`DEX ${i + 1} deployed to:`, dex.target);

        // Adicionando liquidez
        const liquidityAmountA = ethers.parseUnits(liquidityA, 18);
        const liquidityAmountB = ethers.parseUnits(liquidityB, 18);

        await tokenA.approve(dex.target, liquidityAmountA);
        await tokenB.approve(dex.target, liquidityAmountB);
        await dex.addLiquidity(liquidityAmountA, liquidityAmountB);
        console.log(`Liquidity added to DEX ${i + 1}`);

        dexes.push(dex);
    }

    // Exibindo informações das reservas iniciais para cada DEX
    for (let i = 0; i < dexes.length; i++) {
        const reserveA = await dexes[i].reserveA();
        const reserveB = await dexes[i].reserveB();
        console.log(`Reservas DEX ${i + 1}:`);
        console.log(`Token A: ${ethers.formatUnits(reserveA, 18)}`);
        console.log(`Token B: ${ethers.formatUnits(reserveB, 18)}`);
    }

    // Deploy do FlashLoanLender
    const FlashLoanLender = await ethers.getContractFactory("FlashLoanLender");
    const flashLoanLender = await FlashLoanLender.deploy();
    await flashLoanLender.waitForDeployment();
    console.log("FlashLoanLender deployed to:", flashLoanLender.target);

    // Adicionando liquidez ao FlashLoanLender
    for (const token of tokens) {
        const liquidityAmount = ethers.parseUnits("1000000", 18);
        await token.approve(flashLoanLender.target, liquidityAmount);
        await flashLoanLender.deposit(token.target, liquidityAmount);
        console.log(`Liquidity added to FlashLoanLender for token ${await token.symbol()}`);
    }

    console.log("Endereço do FlashLoanLender que será passado:", flashLoanLender.target);


    // Deploy do FlashLoanExecutor
    const FlashLoanExecutor = await ethers.getContractFactory("FlashLoanExecutor");
    const flashLoanExecutor = await FlashLoanExecutor.deploy();
    await flashLoanExecutor.waitForDeployment();
    console.log("FlashLoanExecutor deployed to:", flashLoanExecutor.target);

    // Listagem dos endereços configurados
    console.log("Endereços configurados:");
    console.log("Tokens:");
    tokens.forEach((token, index) => {
        console.log(`${tokenNames[index]} (${tokenSymbols[index]}): ${token.target}`);
    });
    console.log("DEXs:");
    dexes.forEach((dex, index) => {
        console.log(`DEX ${index + 1}: ${dex.target}`);
    });
    console.log("FlashLoanLender:", flashLoanLender.target);
    console.log("FlashLoanExecutor:", flashLoanExecutor.target);
}

main()
    .then(() => process.exit(0))
    .catch((error) => {
        console.error(error);
        process.exit(1);
    });
