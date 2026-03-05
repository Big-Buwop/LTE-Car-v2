// node-pty removed (incompatible with Node 20)
// Remote shell disabled

module.exports = {
    initiate: socket => {
        console.log("[shell] Remote shell disabled (node-pty not available)");
    }
}
