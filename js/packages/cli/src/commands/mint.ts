import {
  Keypair,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  getCandyMachineAddress,
  getMasterEdition,
  getMetadata,
  getTokenWallet,
  loadCandyProgram,
  loadWalletKey,
  uuidFromConfigPubkey,
} from '../helpers/accounts';
import bs58 from 'bs58';
import {
  TOKEN_METADATA_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  COLOR_PROGRAM_ID,
} from '../helpers/constants';
import * as anchor from '@project-serum/anchor';
import { MintLayout, Token } from '@solana/spl-token';
import { createAssociatedTokenAccountInstruction } from '../helpers/instructions';
import { sendTransactionWithRetryWithKeypair } from '../helpers/transactions';

export async function mint(
  userSignature: string,
  env: string,
  configAddress: PublicKey,
  creatorSignature: string = '',
): Promise<any[]> {
  const mint = Keypair.generate();

  const userKeyPair = loadWalletKey(userSignature);
  const anchorProgram = await loadCandyProgram(userKeyPair, env);
  const userTokenAccountAddress = await getTokenWallet(
    userKeyPair.publicKey,
    mint.publicKey,
  );

  const uuid = uuidFromConfigPubkey(configAddress);
  const [candyMachineAddress] = await getCandyMachineAddress(
    configAddress,
    uuid,
  );
  const candyMachine: any = await anchorProgram.account.candyMachine.fetch(
    candyMachineAddress,
  );

  const remainingAccounts = [];
  const signers = [mint, userKeyPair];
  if (creatorSignature.length > 0)
    signers.push(loadWalletKey(creatorSignature));

  const delegate = await anchor.web3.PublicKey.createWithSeed(
    mint.publicKey,
    '',
    COLOR_PROGRAM_ID,
  );
  const instructions = [
    anchor.web3.SystemProgram.createAccount({
      fromPubkey: userKeyPair.publicKey,
      newAccountPubkey: mint.publicKey,
      space: MintLayout.span,
      lamports:
        await anchorProgram.provider.connection.getMinimumBalanceForRentExemption(
          MintLayout.span,
        ),
      programId: TOKEN_PROGRAM_ID,
    }),
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      0,
      userKeyPair.publicKey,
      userKeyPair.publicKey,
    ),
    createAssociatedTokenAccountInstruction(
      userTokenAccountAddress,
      userKeyPair.publicKey,
      userKeyPair.publicKey,
      mint.publicKey,
    ),
    Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      mint.publicKey,
      userTokenAccountAddress,
      userKeyPair.publicKey,
      [],
      1,
    ),
    Token.createApproveInstruction(
      TOKEN_PROGRAM_ID,
      userTokenAccountAddress,
      delegate,
      userKeyPair.publicKey,
      [],
      1,
    ),
    Token.createRevokeInstruction(
      TOKEN_PROGRAM_ID,
      userTokenAccountAddress,
      userKeyPair.publicKey,
      [],
    ),
  ];

  let tokenAccount;
  if (candyMachine.tokenMint) {
    const transferAuthority = anchor.web3.Keypair.generate();

    tokenAccount = await getTokenWallet(
      userKeyPair.publicKey,
      candyMachine.tokenMint,
    );

    remainingAccounts.push({
      pubkey: tokenAccount,
      isWritable: true,
      isSigner: false,
    });
    remainingAccounts.push({
      pubkey: userKeyPair.publicKey,
      isWritable: false,
      isSigner: true,
    });

    instructions.push(
      Token.createApproveInstruction(
        TOKEN_PROGRAM_ID,
        tokenAccount,
        transferAuthority.publicKey,
        userKeyPair.publicKey,
        [],
        candyMachine.data.price.toNumber(),
      ),
    );
  }
  const metadataAddress = await getMetadata(mint.publicKey);
  const masterEdition = await getMasterEdition(mint.publicKey);

  instructions.push(
    await anchorProgram.instruction.mintNftWithCreatorSignature({
      accounts: {
        config: configAddress,
        candyMachine: candyMachineAddress,
        payer: userKeyPair.publicKey,
        //@ts-ignore
        wallet: candyMachine.wallet,
        mint: mint.publicKey,
        metadata: metadataAddress,
        masterEdition,
        mintAuthority: userKeyPair.publicKey,
        updateAuthority: userKeyPair.publicKey,
        tokenMetadataProgram: TOKEN_METADATA_PROGRAM_ID,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: SystemProgram.programId,
        rent: anchor.web3.SYSVAR_RENT_PUBKEY,
        clock: anchor.web3.SYSVAR_CLOCK_PUBKEY,
      },
      remainingAccounts,
    }),
  );

  const color_account = (
    await PublicKey.findProgramAddress(
      [
        Buffer.from('color'),
        mint.publicKey.toBuffer(),
        Buffer.from([5, 0, 0, 0, 0, 0, 0, 0]),
      ],
      COLOR_PROGRAM_ID,
    )
  )[0];
  const colorInstruction = new TransactionInstruction({
    programId: COLOR_PROGRAM_ID,
    keys: [
      { pubkey: metadataAddress, isSigner: false, isWritable: false },
      { pubkey: color_account, isSigner: false, isWritable: true },
      { pubkey: userKeyPair.publicKey, isSigner: false, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
    ],
    data: Buffer.concat([
      Buffer.from([0]),
      Buffer.from(bs58.decode(mint.publicKey.toString())),
    ]),
  });

  instructions.push(colorInstruction);

  if (tokenAccount) {
    instructions.push(
      Token.createRevokeInstruction(
        TOKEN_PROGRAM_ID,
        tokenAccount,
        userKeyPair.publicKey,
        [],
      ),
    );
  }

  return [
    (
      await sendTransactionWithRetryWithKeypair(
        anchorProgram.provider.connection,
        userKeyPair,
        instructions,
        signers,
      )
    ).txid,
    mint.publicKey.toBase58(),
    candyMachine.itemsRedeemed.toNumber(),
  ];
}
