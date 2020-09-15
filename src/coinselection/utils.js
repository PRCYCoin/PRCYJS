const constants = require('../dapslib/constants');

// Compute the transaction fee based on the Number of Inputs, Number of Outputs, and Ring Size
function ComputeTxSize(numIn, numOut, ringSize)
{
    var txinSize = 36 + 4 + 33 + 36 * ringSize;
    var txoutSize = 8 + 35 + 33 + 32 + 32 + 32 + 33;
    var bpSize = numOut == 1 ? 675 : 738;
    var txSize = 4 + numIn * txinSize + numOut * txoutSize + 4 + 1 + 8 + 4 + bpSize + 8 + 32 + (numIn + 1) * (ringSize + 1) * 32 + 33;
    return txSize;
}

// Compute the transaction fee based on the Number of Inputs, Number of Outputs, and Ring Size
function ComputeFee(numIn, numOut, ringSize)
{
    var txSize = ComputeTxSize(numIn, numOut, ringSize);
    var nFeeNeeded = constants.BASE_FEE + (txSize/1000) * 10000000;
    return nFeeNeeded;
}

module.exports = {
    ComputeTxSize, 
    ComputeFee
}