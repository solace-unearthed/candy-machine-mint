import { useEffect, useState } from "react";
import styled from "styled-components";
import Countdown from "react-countdown";
import { Button, CircularProgress, Snackbar } from "@material-ui/core";
import Alert from "@material-ui/lab/Alert";

import * as anchor from "@project-serum/anchor";

import { LAMPORTS_PER_SOL } from "@solana/web3.js";

import { useAnchorWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-material-ui";

import {
  CandyMachine,
  awaitTransactionSignatureConfirmation,
  getCandyMachineState,
  mintOneToken,
  shortenAddress,
} from "./candy-machine";

const ConnectButton = styled(WalletMultiButton)``;

const CounterText = styled.span``; // add your styles here

const MintContainer = styled.div``; // add your styles here

const MintButton = styled(Button)`
  font-family: 'Poppins', sans-serif;
  color: white;
  background-color: #282626;
`; // add your styles here

export interface HomeProps {
  candyMachineId: anchor.web3.PublicKey;
  config: anchor.web3.PublicKey;
  connection: anchor.web3.Connection;
  startDate: number;
  treasury: anchor.web3.PublicKey;
  txTimeout: number;
}

const Home = (props: HomeProps) => {
  const [api_url, setUrl] = useState(process.env.REACT_APP_API_URL)
  const [balance, setBalance] = useState<number>();
  const [isActive, setIsActive] = useState(false); // true when countdown completes
  const [isSoldOut, setIsSoldOut] = useState(false); // true when items remaining is zero
  const [isMinting, setIsMinting] = useState(false); // true when user got to press MINT
  const [isWhitelisted, SetWhitelisted] = useState(false);

  const [itemsAvailable, setItemsAvailable] = useState(0);
  const [itemsRedeemed, setItemsRedeemed] = useState(0);
  const [itemsRemaining, setItemsRemaining] = useState(0);

  const [alertState, setAlertState] = useState<AlertState>({
    open: false,
    message: "",
    severity: undefined,
  });

  const [startDate, setStartDate] = useState(new Date(props.startDate));

  const wallet = useAnchorWallet();
  const [candyMachine, setCandyMachine] = useState<CandyMachine>();

  const refreshCandyMachineState = () => {
    (async () => {
      if (!wallet) return;

      const {
        candyMachine,
        goLiveDate,
        itemsAvailable,
        itemsRemaining,
        itemsRedeemed,
      } = await getCandyMachineState(
        wallet as anchor.Wallet,
        props.candyMachineId,
        props.connection
      );

      setItemsAvailable(itemsAvailable);
      setItemsRemaining(itemsRemaining);
      setItemsRedeemed(itemsRedeemed);

      setIsSoldOut(itemsRemaining === 0);
      setStartDate(goLiveDate);
      setCandyMachine(candyMachine);

      setIsActive(false);
    })();
  };

  const onMint = async () => {
    try {
      let res = await fetch(`${api_url}/whitelisted/member/${(wallet as anchor.Wallet).publicKey.toString()}`, { method: "GET" })
      const res_json = await res.json()
      const res_num = await JSON.parse(JSON.stringify(res_json)).reserve //The number  of reserves the user has left
      if (!isWhitelisted) {
        throw new Error("You are not whitelisted");
      }
      if (res_num - 1 < 0) {
        console.log("confirmed")
        throw new Error("Not enough reserves");
      }
      setIsMinting(true);
      if (wallet && candyMachine?.program) {
        const mintTxId = await mintOneToken(
          candyMachine,
          props.config,
          wallet.publicKey,
          props.treasury
        );

        const status = await awaitTransactionSignatureConfirmation(
          mintTxId,
          props.txTimeout,
          props.connection,
          "singleGossip",
          false
        );

        if (!status?.err) {
          setAlertState({
            open: true,
            message: "Congratulations! Mint succeeded!",
            severity: "success",
          });
          const to_send = await JSON.stringify({ "reserve": res_num - 1 })
          await fetch(`${api_url}/whitelisted/update/${(wallet as anchor.Wallet).publicKey.toString()}/${process.env.REACT_APP_SECRET_KEY}`, {
            method: "PUT",
            headers: {
              'Content-Type': 'application/json',
            },
            body: to_send
          })
          console.log("Updated Reserves for user")

        } else {
          setAlertState({
            open: true,
            message: "Mint failed! Please try again!",
            severity: "error",
          });
        }
      }
    } catch (error: any) {
      // TODO: blech:
      let message = error.msg || "Minting failed! Please try again!";
      if (!error.msg) {
        if (error.message === '"Cannot read properties of undefined (reading \'publicKey\')"') {
          message = error.message;
        }
        else if (error.message === "You are not whitelisted") {
          message = error.message;
        } 
        else if (error.message === "Not enough reserves") {
          message = error.message
        } 
        else if (error.message.indexOf("0x137")) {
          message = `SOLD OUT!`;
        } 
        else if (error.message.indexOf("0x135")) {
          message = `Insufficient funds to mint. Please fund your wallet.`;
        } 
        else if (error.message.indexOf("0x138")) {
        
        }
      } else {
        if (error.code === 311) {
          message = `SOLD OUT!`;
          setIsSoldOut(true);
        } else if (error.code === 312) {
          message = `Minting period hasn't started yet.`;
        }
      }

      setAlertState({
        open: true,
        message,
        severity: "error",
      });
    } finally {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
      }
      setIsMinting(false);
      refreshCandyMachineState();
    }
  };

  useEffect(() => {
    (async () => {
      if (wallet) {
        const balance = await props.connection.getBalance(wallet.publicKey);
        setBalance(balance / LAMPORTS_PER_SOL);
        const data = await fetch(`${api_url}/whitelisted/member/${(wallet as anchor.Wallet).publicKey.toString()}`)
        if (data.status.toString() !== "404") {
          SetWhitelisted(true)
        }
        else {
          console.log("not found")
        }
      }
    })();
  }, [wallet, props.connection]);

  useEffect(refreshCandyMachineState, [
    wallet,
    props.candyMachineId,
    props.connection,
  ]);

  return (
    <main
      style={{
        display: "flex",
        height: "100vh",
      }}
    >
      <div
        style={{
          padding: 30,
          display: "flex",
          flex: 1,
          flexDirection: "column"
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",

          }}
        >
          {wallet && (
            <p style={{
              backgroundColor: "#282626",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: "bold",
              fontSize: 15,
              padding: 5
            }}>
              {shortenAddress(wallet.publicKey.toBase58() || "")}
            </p>
          )}
          <div></div>
          <ConnectButton>{wallet ? "Connected" : "Connect Wallet"}</ConnectButton>
        </div>
        <div
          style={{
            flex: 1,
            display: "flex",
            justifyContent: "space-evenly",
            alignItems: "center",
            flexDirection: "column"
          }}
        >

          <div>
            <p style={{
              backgroundColor: "#282626",
              fontFamily: "'Poppins', sans-serif",
              fontWeight: "bold",
              fontSize: 35,
              padding: 20
            }}>Prickly Pete's Platoon <br /> </p>
          </div>


          <MintContainer>
            <MintButton
              disabled={isSoldOut || isMinting || !isActive}
              onClick={onMint}
              variant="contained"
            >
              {
                isSoldOut ? (
                  "SOLD OUT"
                )
                  : isActive ? (
                    isMinting ? (
                      <CircularProgress />
                    )
                      : (
                        "MINT"
                      )
                  )
                    : (
                      <Countdown
                        date={startDate}
                        onMount={({ completed }) => completed && setIsActive(true)}
                        onComplete={() => setIsActive(true)}
                        renderer={renderCounter}
                      />
                    )
              }
            </MintButton>

          </MintContainer>

          <div style={{
            backgroundColor: "#282626",
            fontFamily: "'Poppins', sans-serif",
            fontWeight: "bold",
            fontSize: 25,
            textAlign: "center",
            padding: "20px"
          }}>
            {/* {wallet && <p>Balance: {(balance || 0).toLocaleString()} SOL</p>} */}

            {wallet && <p>Minted : {itemsRedeemed}/{itemsAvailable}</p>}

            {/* {wallet && <p>Platoons Remaining: {itemsRemaining}</p>} */}

            {/* {wallet && <p> {String(startDate)} </p>} */}

            <p>
              <a href="https://twitter.com/pricklyplatoons"><img src="https://img.icons8.com/color/60/000000/twitter--v1.png" /></a>
              <a href="https://discord.gg/wt3PwDSETz"><img src="https://img.icons8.com/fluency/50/000000/discord.png" /></a>
            </p>

          </div>
        </div>

        <Snackbar
          open={alertState.open}
          autoHideDuration={6000}
          onClose={() => setAlertState({ ...alertState, open: false })}
        >
          <Alert
            onClose={() => setAlertState({ ...alertState, open: false })}
            severity={alertState.severity}
          >
            {alertState.message}
          </Alert>
        </Snackbar>
      </div>
    </main>
  );
};

interface AlertState {
  open: boolean;
  message: string;
  severity: "success" | "info" | "warning" | "error" | undefined;
}

const renderCounter = ({ days, hours, minutes, seconds, completed }: any) => {
  return (
    <CounterText>
      {hours + (days || 0) * 24} hours, {minutes} minutes, {seconds} seconds
    </CounterText>
  );
};

export default Home;
