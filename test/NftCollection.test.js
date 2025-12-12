const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("NftCollection", function () {
  const NAME = "MyNFT";
  const SYMBOL = "MNFT";
  const MAX_SUPPLY = 10;
  const BASE_URI = "https://example.com/metadata/";

  async function deployFixture() {
    const [owner, addr1, addr2] = await ethers.getSigners();
    const NftCollection = await ethers.getContractFactory("NftCollection");
    const nft = await NftCollection.deploy(NAME, SYMBOL, MAX_SUPPLY, BASE_URI);
    await nft.waitForDeployment();
    return { nft, owner, addr1, addr2 };
  }

  it("initial configuration is correct", async function () {
    const { nft } = await deployFixture();

    expect(await nft.name()).to.equal(NAME);
    expect(await nft.symbol()).to.equal(SYMBOL);
    expect(await nft.maxSupply()).to.equal(MAX_SUPPLY);
    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.baseURI()).to.equal(BASE_URI);
    expect(await nft.mintingPaused()).to.equal(false);
  });

  it("only owner can mint", async function () {
    const { nft, addr1 } = await deployFixture();

    // Non-owner should not be able to mint — different OZ versions use different revert styles
    await expect(
      nft.connect(addr1).safeMint(addr1.address, 1)
    ).to.be.reverted;
  });

  it("owner can mint and updates balances & totalSupply", async function () {
    const { nft, owner, addr1 } = await deployFixture();

    await expect(nft.safeMint(addr1.address, 1))
      .to.emit(nft, "Transfer")
      .withArgs(ethers.ZeroAddress, addr1.address, 1);

    expect(await nft.totalSupply()).to.equal(1);
    expect(await nft.balanceOf(addr1.address)).to.equal(1);
    expect(await nft.ownerOf(1)).to.equal(addr1.address);

    // tokenURI should work and start with baseURI
    const uri = await nft.tokenURI(1);
    expect(uri).to.equal(`${BASE_URI}1`);
  });

  it("reverts minting to zero address", async function () {
    const { nft } = await deployFixture();

    await expect(
      nft.safeMint(ethers.ZeroAddress, 1)
    ).to.be.revertedWith("Mint to zero address");
  });

  it("reverts minting with invalid tokenId range", async function () {
    const { nft } = await deployFixture();

    await expect(nft.safeMint(await nft.getAddress(), 0)).to.be.revertedWithCustomError(
      nft,
      "InvalidTokenId"
    );

    await expect(
      nft.safeMint(await nft.getAddress(), MAX_SUPPLY + 1)
    ).to.be.revertedWithCustomError(nft, "InvalidTokenId");
  });

  it("prevents double mint of the same tokenId", async function () {
    const { nft, owner } = await deployFixture();
    const addr = owner.address;

    // first mint should succeed
    await nft.safeMint(addr, 1);

    // second mint of same id should revert — message may vary across OZ versions, so assert generic revert
    await expect(nft.safeMint(addr, 1)).to.be.reverted;
  });

  it("enforces max supply", async function () {
    const { nft, owner } = await deployFixture();
    const addr = owner.address;

    for (let i = 1; i <= MAX_SUPPLY; i++) {
      await nft.safeMint(addr, i);
    }

    // minting beyond max supply reverts with custom error MaxSupplyReached
    await expect(
      nft.safeMint(addr, MAX_SUPPLY) // any id beyond supply should fail
    ).to.be.revertedWithCustomError(nft, "MaxSupplyReached");
  });

  it("can pause and unpause minting", async function () {
    const { nft, owner } = await deployFixture();
    const addr = owner.address;

    await nft.pauseMinting();
    expect(await nft.mintingPaused()).to.equal(true);

    await expect(
      nft.safeMint(addr, 1)
    ).to.be.revertedWithCustomError(nft, "MintingPausedError");

    await nft.unpauseMinting();
    expect(await nft.mintingPaused()).to.equal(false);

    await nft.safeMint(addr, 1);
    expect(await nft.totalSupply()).to.equal(1);
  });

  it("transfers update ownership and balances", async function () {
    const { nft, owner, addr1, addr2 } = await deployFixture();

    await nft.safeMint(addr1.address, 1);

    await expect(
      nft.connect(addr1).transferFrom(addr1.address, addr2.address, 1)
    )
      .to.emit(nft, "Transfer")
      .withArgs(addr1.address, addr2.address, 1);

    expect(await nft.balanceOf(addr1.address)).to.equal(0);
    expect(await nft.balanceOf(addr2.address)).to.equal(1);
    expect(await nft.ownerOf(1)).to.equal(addr2.address);
  });

  it("reverts transfer of non-existent token", async function () {
    const { nft, addr1 } = await deployFixture();

    // Different OpenZeppelin versions may use different revert formats; assert a generic revert
    await expect(
      nft.connect(addr1).transferFrom(addr1.address, addr1.address, 999)
    ).to.be.reverted;
  });

  it("supports approvals for single token", async function () {
    const { nft, owner, addr1, addr2 } = await deployFixture();

    await nft.safeMint(addr1.address, 1);

    await expect(
      nft.connect(addr1).approve(addr2.address, 1)
    )
      .to.emit(nft, "Approval")
      .withArgs(addr1.address, addr2.address, 1);

    expect(await nft.getApproved(1)).to.equal(addr2.address);

    // approved address can transfer
    await nft.connect(addr2).transferFrom(addr1.address, owner.address, 1);
    expect(await nft.ownerOf(1)).to.equal(owner.address);
  });

  it("supports operator approvals", async function () {
    const { nft, owner, addr1, addr2 } = await deployFixture();

    // Mint 2 tokens to addr1
    await nft.safeMint(addr1.address, 1);
    await nft.safeMint(addr1.address, 2);

    await expect(
      nft.connect(addr1).setApprovalForAll(addr2.address, true)
    )
      .to.emit(nft, "ApprovalForAll")
      .withArgs(addr1.address, addr2.address, true);

    expect(
      await nft.isApprovedForAll(addr1.address, addr2.address)
    ).to.equal(true);

    // operator transfers both tokens
    await nft.connect(addr2).transferFrom(addr1.address, owner.address, 1);
    await nft.connect(addr2).transferFrom(addr1.address, owner.address, 2);

    expect(await nft.balanceOf(owner.address)).to.equal(2);
  });

  it("revoking operator approval prevents transfers", async function () {
    const { nft, owner, addr1, addr2 } = await deployFixture();

    await nft.safeMint(addr1.address, 1);

    await nft.connect(addr1).setApprovalForAll(addr2.address, true);
    await nft.connect(addr1).setApprovalForAll(addr2.address, false);

    expect(
      await nft.isApprovedForAll(addr1.address, addr2.address)
    ).to.equal(false);

    // Various OZ versions differ in revert text; assert generic revert
    await expect(
      nft.connect(addr2).transferFrom(addr1.address, owner.address, 1)
    ).to.be.reverted;
  });

  it("burn keeps totalSupply and balances consistent", async function () {
    const { nft, owner, addr1 } = await deployFixture();

    await nft.safeMint(addr1.address, 1);
    expect(await nft.totalSupply()).to.equal(1);

    await expect(nft.connect(addr1).burn(1))
      .to.emit(nft, "Transfer")
      .withArgs(addr1.address, ethers.ZeroAddress, 1);

    expect(await nft.totalSupply()).to.equal(0);
    expect(await nft.balanceOf(addr1.address)).to.equal(0);

    // ownerOf for a burned token may revert with different formats — assert generic revert
    await expect(nft.ownerOf(1)).to.be.reverted;
  });

  it("non-owner/non-approved cannot burn", async function () {
    const { nft, owner, addr1, addr2 } = await deployFixture();

    await nft.safeMint(addr1.address, 1);

    await expect(
      nft.connect(addr2).burn(1)
    ).to.be.revertedWithCustomError(nft, "NotTokenOwnerOrApproved");
  });

  it("mint + transfer gas usage is within a reasonable bound", async function () {
    const { nft, owner, addr1 } = await deployFixture();

    const mintTx = await nft.safeMint(owner.address, 1);
    const mintReceipt = await mintTx.wait();
    const mintGas = mintReceipt.gasUsed;

    const transferTx = await nft.transferFrom(
      owner.address,
      addr1.address,
      1
    );
    const transferReceipt = await transferTx.wait();
    const transferGas = transferReceipt.gasUsed;

    const totalGas = mintGas + transferGas;

    // basic conservative bound (you can adjust)
    expect(totalGas).to.be.lessThan(300000n);
  });
});
