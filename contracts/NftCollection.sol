// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title NftCollection
 * @dev ERC-721 with maxSupply, admin minting, pause/unpause minting, baseURI, burn.
 */
contract NftCollection is ERC721, Ownable {
    uint256 public immutable maxSupply;
    uint256 private _totalSupply;
    bool public mintingPaused;
    string private _baseTokenURI;

    event MintingPaused(address indexed admin);
    event MintingUnpaused(address indexed admin);
    event BaseURIUpdated(string newBaseURI);

    error MintingPausedError();
    error MaxSupplyReached();
    error InvalidTokenId();
    error NotTokenOwnerOrApproved();

    modifier whenMintingNotPaused() {
        if (mintingPaused) revert MintingPausedError();
        _;
    }

    // ---- constructor: note Ownable(msg.sender) to satisfy OZ v5+ ----
    constructor(
        string memory name_,
        string memory symbol_,
        uint256 maxSupply_,
        string memory baseURI_
    ) ERC721(name_, symbol_) Ownable(msg.sender) {
        require(maxSupply_ > 0, "Max supply must be > 0");
        maxSupply = maxSupply_;
        _baseTokenURI = baseURI_;
    }

    // ---- views ----
    function totalSupply() public view returns (uint256) {
        return _totalSupply;
    }

    function baseURI() external view returns (string memory) {
        return _baseTokenURI;
    }

    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }

    // ---- admin config ----
    function pauseMinting() external onlyOwner {
        mintingPaused = true;
        emit MintingPaused(msg.sender);
    }

    function unpauseMinting() external onlyOwner {
        mintingPaused = false;
        emit MintingUnpaused(msg.sender);
    }

    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _baseTokenURI = newBaseURI;
        emit BaseURIUpdated(newBaseURI);
    }

    // ---- mint / burn ----
    function safeMint(address to, uint256 tokenId)
        external
        onlyOwner
        whenMintingNotPaused
    {
        if (to == address(0)) {
            revert("Mint to zero address");
        }

        if (tokenId == 0 || tokenId > maxSupply) {
            revert InvalidTokenId();
        }

        if (_totalSupply >= maxSupply) {
            revert MaxSupplyReached();
        }

        // rely on OpenZeppelin's _safeMint for duplicate checks
        _totalSupply += 1;
        _safeMint(to, tokenId);
    }

    function burn(uint256 tokenId) external {
        if (!_isApprovedOrOwner(msg.sender, tokenId)) {
            revert NotTokenOwnerOrApproved();
        }

        _burn(tokenId);
        _totalSupply -= 1;
    }

    // ---- internal helper ----
    function _isApprovedOrOwner(address spender, uint256 tokenId)
        internal
        view
        returns (bool)
    {
        address owner_ = ownerOf(tokenId); // reverts if token doesn't exist
        return (spender == owner_ ||
            getApproved(tokenId) == spender ||
            isApprovedForAll(owner_, spender));
    }
}
