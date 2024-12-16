from web3 import Web3

# Conectar ao Hardhat Node
web3 = Web3(Web3.HTTPProvider("http://127.0.0.1:8545"))
print("Conectado ao Hardhat Node:", web3.is_connected())


# Endereço do contrato e ABI
contract_address = "0x5FC8d32690cc91D4c39d9d3abcBD16989F875707"
contract_abi = [
    {
        "inputs": [],
        "name": "owner",
        "outputs": [{"internalType": "address", "name": "", "type": "address"}],
        "stateMutability": "view",
        "type": "function",
    }
]

# Conectar ao contrato
contract = web3.eth.contract(address=contract_address, abi=contract_abi)

# Chamar a função `owner`
owner = contract.functions.owner().call()
print("Proprietário do contrato:", owner)
